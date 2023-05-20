import { print } from "./devUtils";
import { EventTopic, Topic } from "./topic";
import { Change } from "./change";
import { Callback, Constructor, defined } from "./utils";
import { v4 as uuidv4 } from 'uuid';

class StackTracker{
    stack: string[] = [];
    enter(id: string, callback: Callback): void{
        try{
            this.stack.push(id);
            callback();
        }
        finally{
            this.stack.pop();
        }
    }
    getStack(): string[]{
        return this.stack;
    }
}

/**
 * A data structure that stores information of a previewing change.
 */
class PreviewItem{
    actionID: string;
    change: Change<any>;
    constructor(actionID: string, change: Change<any>){
        this.actionID = actionID;
        this.change = change;
    }
}

export class StateManager{
    private topics: Map<string, Topic<any>>;
    private allPreview: PreviewItem[];
    private allPretendedChanges: PreviewItem[];
    private recordingPreviewOrPretend: PreviewItem[];
    private recordingAction: Change<any>[];
    private isRecording: boolean;
    private _isPretending: boolean;
    get isPretending(): boolean{ return this._isPretending; }
    private onActionProduced: ((action: Change<any>[],actionID:string) => void);
    private onActionFailed: (() => void);
    private recursionDepth: number;
    private blockApplyChange: boolean;
    private stackTracker: StackTracker = new StackTracker();
    private pendingUnsubscriptions: Topic<any>[] = [];

    constructor(onActionProduced: (action:Change<any>[],actionID:string) => void, onActionFailed: () => void) {
        this.topics = new Map<string, Topic<any>>();
        this.allPreview = [];
        this.allPretendedChanges = [];
        this.recordingPreviewOrPretend = [];
        this.recordingAction = [];
        this.isRecording = false;
        this._isPretending = false;
        this.onActionProduced = onActionProduced;
        this.onActionFailed = onActionFailed;
        this.recursionDepth = 0;
        this.blockApplyChange = false;

        this.record= this.record.bind(this);
        this.applyChange = this.applyChange.bind(this);
        this.clearPretendedChanges = this.clearPretendedChanges.bind(this);
    }

    get allSubscribedTopics(): Map<string, Topic<any>> {
        return this.topics
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

    addPretendedTopic<T extends Topic<any>>(topicName: string, topicType: string|Constructor<T>): T {
        if (this.topics.has(topicName)) {
            this.topics.delete(topicName);
            
        }
        let newTopic = this.addSubsciption(topicName,topicType);
        newTopic.isPretended = true;
        return newTopic;
    }

    removePretendedTopic(topicName: string) {
        if (!this.topics.has(topicName)) {
            throw new Error(`Topic ${topicName} is not in the subscription.`);
        }
        if (!this.getTopic(topicName).isPretended) {
            throw new Error(`Topic ${topicName} is not pretended.`);
        }
        let topic = this.getTopic(topicName)
        this.pendingUnsubscriptions.push(topic);
    }

    addSubsciption<T extends Topic<any>>(topicName: string, topicType: string|Constructor<T>): T {
        if (this.topics.has(topicName)) {
            throw new Error(`Topic ${topicName} is already in the subscription.`);
        }
        
        let t;
        if (typeof topicType === 'string') {
            t = Topic.GetTypeFromName(topicType);
        }
        else {
            t = topicType;
        }
        let topic = new t(topicName, this);
        this.topics.set(topicName, topic);
        print(`Topic ${topicName} added. Now subscribed topics are:`, this.topics.keys());
        return topic as T;
    }

    /**
     * 
     * @param topicName The name of the topic to be removed.
     * @returns If the topic is pretended, return true. Otherwise, return false.
     */
    removeSubscription(topicName: string): boolean {
        if (!this.topics.has(topicName)) {
            throw new Error(`Topic ${topicName} is not in the subscription.`);
        }
        let topic = this.getTopic(topicName)
        this.pendingUnsubscriptions.push(topic);
        print(`Topic ${topicName} removed. Now subscribed topics are:`, this.topics.keys());
        return topic.isPretended;
    }

    getIsRecording(): boolean{
        return this.isRecording;
    }

    /**
     * 
     * @param callback The callback function that does the actions to be recorded.
     * @param pretend Pass true to make the action "pretended", so it will not be sent to the server.
     * @returns void
     */
    record(callback = () => {}, pretend = false): void{
        if (this.isRecording) {
            callback();
            return;
        }

        this.isRecording = true;
        this._isPretending = pretend;
        let exceptionOccurred = false;
        try{
            callback();
        }
        catch(e){
            exceptionOccurred = true;
            this.undo(this.recordingPreviewOrPretend.map(x=>x.change))
            this.recordingPreviewOrPretend = [];
            throw e;
        }
        finally{
            if (!exceptionOccurred){
                const actionID = uuidv4();
                if(this._isPretending){
                    for(const previewItem of this.recordingPreviewOrPretend){
                        this.allPretendedChanges.push(previewItem);
                    }
                }else{
                    for(const previewItem of this.recordingPreviewOrPretend){
                        this.allPreview.push(previewItem);
                    }
                }
                if(!this._isPretending)
                    this.onActionProduced(this.recordingAction,actionID);
            }
            else{
                if(!this._isPretending)
                    this.onActionFailed();
            }
            this.recordingPreviewOrPretend = [];
            this.recordingAction = [];
            this.isRecording = false;
            this._isPretending = false;

            this.processUnsubscriptions();
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

        if (this.stackTracker.getStack().includes(change.topic.getName())){
            // Prevent infinite recursion
            return;
        }

        // generate a actionID
        const actionID = uuidv4();
        if (preview){
            // simulate the transition due to the action.
            this.stackTracker.enter(change.topic.getName(), () => {
                this.recursionDepth++;
                
                this.recordingPreviewOrPretend.push(new PreviewItem(actionID,change));
                try{
                    change.execute();
                }
                catch(e){
                    // revert the whole subtree
                    console.log(e)
                    this.undo(this.recordingPreviewOrPretend.map(x=>x.change),change);
                    this.recordingPreviewOrPretend = [];
                    throw e;
                }
                finally{
                    this.recursionDepth--;
                }
            });
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

                if (this.allPreview.length == 0){
                    change.execute();
                    continue;
                }
                
                if (this.allPreview[0].actionID == actionID && this.allPreview[0].change.id == change.id){
                    // match
                    this.allPreview.shift();
                }else{
                    // not match, revert all
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

            // restore the reverted pretended changes
            this._isPretending = true; // set the flag so the client knows it is pretending, and will not send subscription to the server.
            this._isPretending = false;
        });
        this.processUnsubscriptions();
    }

    handleReject(): void{
        /*Recieve a reject from the server.*/
        this.blockApplyChangeContext(() => {
            this.undo(this.allPreview.map(x => x.change));
            this.allPreview = [];
        });
        this.processUnsubscriptions();
    }

    /**
     * After doing some pretended changes, call this function to clear those pretended changes.
     * @returns void
     */
    clearPretendedChanges(): void{
        if(this.isRecording)
            throw new Error("Cannot clear pretended changes while recording.");
        
        this.blockApplyChangeContext(() => {
            this.undo(this.allPretendedChanges.map(x => x.change));
        });
        this.allPretendedChanges = [];
        this.processUnsubscriptions();
    }

    private blockApplyChangeContext(callback: () => void): void{
        if(this.blockApplyChange){
            callback();
            return;
        }
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
            let change = defined(transition.pop());
            if (change == until)
                break;
            if (!(change.topic instanceof EventTopic)){
                change.inverse().execute();
            }
        }
        });
    }

    private processUnsubscriptions(): void{
        for(const topic of this.pendingUnsubscriptions){
            topic.setDetached();
            if(this.topics.get(topic.getName()) == topic)
                this.topics.delete(topic.getName());
        }
        this.pendingUnsubscriptions = [];
    }
}