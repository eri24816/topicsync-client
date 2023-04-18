import { print } from "./devUtils";
import { SetTopic, Topic } from "./topic";
import { Change, SetChangeTypes } from "./change";
import { defined } from "./utils";
import { v4 as uuidv4 } from 'uuid';

export class StateManager{
  private topics: Map<string, Topic<any>>;
  private allPreview: {actionID:string,change:Change<any>}[];
  private recordingPreview: Change<any>[];
  private recordingAction: Change<any>[];
  private isRecording: boolean;
  private onActionProduced: ((action: Change<any>[],actionID:string) => void);
  private onActionFailed: (() => void);
  private recursionDepth: number;
  private blockApplyChange: boolean;

  private topicSet: SetTopic;
  constructor(onActionProduced: (action:Change<any>[],actionID:string) => void, onActionFailed: () => void) {
    this.topics = new Map<string, Topic<any>>();
    this.allPreview = [];
    this.recordingPreview = [];
    this.recordingAction = [];
    this.isRecording = false;
    this.onActionProduced = onActionProduced;
    this.onActionFailed = onActionFailed;
    this.recursionDepth = 0;
    this.blockApplyChange = false;

    this.topicSet = new SetTopic("_chatroom/topics", this,[{topic_name:"_chatroom/topics",topic_type:"set"}]);
      
    this.topics.set(this.topicSet.getName(), this.topicSet);
  }

  getTopic<T extends Topic<any>>(topicName: string): T {
    if (!this.topics.has(topicName)) {
      throw new Error(`Topic ${topicName} is not in the subscription.`);
    }
    return defined(this.topics.get(topicName)) as T;
  }

  hasTopic(topicName: string): boolean {
    return this.topics.has(topicName);
  }

  existsTopic(topicName: string): boolean {
    //TODO: optimize
    for (const topicDict of this.topicSet.getValue()) {
      if (topicDict.topic_name === topicName) {
        return true;
      }
    }
    return false;
  }

  getTopicType(topicName: string): string {
    for (const topicDict of this.topicSet.getValue()) {
          if (topicDict.topic_name === topicName) {
            return topicDict.topic_type;
          }
        }
    throw new Error(`Topic ${topicName} does not exist.`);
  }

  subscribe(topicName: string): Topic<any> {
    if (!this.existsTopic(topicName)) {
      throw new Error(`Topic ${topicName} does not exist.`);
    }
    let topicType = this.getTopicType(topicName);
    let t = Topic.GetTypeFromName(topicType)
    let topic = new t(topicName, this);
    this.topics.set(topicName, topic);
    return topic;
  }

  getIsRecording(): boolean{
    return this.isRecording;
  }
  
  record(callback = () => {}): void{
    if (this.isRecording) {
      throw new Error("Cannot call record() while recording.");
    }

    this.isRecording = true;
    let exceptionOccurred = false;
    try{
      callback();
    }
    catch(e){
      exceptionOccurred = true;
      this.undo(this.recordingPreview)
      throw e;
    }
    finally{
      if (!exceptionOccurred){
        const actionID = uuidv4();
        for(const change of this.recordingPreview){
          this.allPreview.push({actionID:actionID,change:change});
        }
        this.onActionProduced(this.recordingAction,actionID);
      }
      else{
        this.onActionFailed();
      }
      this.recordingPreview = [];
      this.recordingAction = [];
      this.isRecording = false;
    }
  }
  
  applyChange(change: Change<any>,preview:boolean=false): void{
    if (this.blockApplyChange)
      return; //TODO: allow non-state topic changes.

    if (!this.isRecording) {
      // enter this.record and call this.applyChange again
      this.record(() => {
        this.applyChange(change,preview);
      });
      return;
    }

    if (preview){
    // simulate the transition due to the action.
      this.recursionDepth++;
      this.recordingPreview.push(change);
      try{
        change.execute();
      }
      catch(e){
        // revert the whole subtree
        console.log(e)
        this.undo(this.recordingPreview,change);
        throw e;
      }
      finally{
        this.recursionDepth--;
      }
    }

    // the first-layer calls to applyChange() in record() are recorded in the action
    if (this.recursionDepth == 0) {
      this.recordingAction.push(change);
    }
  }

  handleUpdate(transition: Change<any>[],actionID:string): void{
    /*Recieve an update from the server.*/
    this.blockApplyChangeContext(() => {
      for (const change of transition){

        this.checkTopicRemoval(change);

        if (this.allPreview.length == 0){
          change.execute();
          continue;
        }
        
        if (this.allPreview[0].actionID == actionID && this.allPreview[0].change.id == change.id){
          this.allPreview.shift();
        }else{
          this.undo(this.allPreview.map(x => x.change));
          this.allPreview = [];
          change.execute();
        }
      }
      // revert all if preview of this action is not empty
      if (this.allPreview.length > 0 && this.allPreview[0].actionID == actionID){
        this.undo(this.allPreview.map(x => x.change));
        this.allPreview = [];
      }
    });
  }

  private checkTopicRemoval(change: Change<any>): void{
    if (change.topic === this.topicSet){
      if (change instanceof SetChangeTypes.Remove){
        defined(this.topics.get(change.item.topic_name)).setDetached();
        this.topics.delete(change.item.topic_name);
      }
    }
  }

  handleReject(): void{
    /*Recieve a reject from the server.*/
    this.undo(this.allPreview.map(x => x.change));
    this.allPreview = [];
  }

  private blockApplyChangeContext(callback: () => void): void{
    this.blockApplyChange = true;
    try{
      callback();
    }finally{
      this.blockApplyChange = false;
    }
  }

  private undo(transition: Change<any>[],until?:Change<any>): void{
    this.blockApplyChangeContext(() => {
    while (transition.length > 0){
      let change = transition.pop();
      defined(change).inverse().execute();
      if (change == until)
        break;
    }
    });
  }
}