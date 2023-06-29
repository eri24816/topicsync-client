import { print } from "./devUtils";
import { EventTopic, Topic } from "./topic";
import { Change } from "./change";
import { Callback, Constructor, IdGenerator, defined } from "./utils";

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
    private topicsToSetDetached: Topic<any>[] = [];
    private isDoingTransition: boolean = false; // True if the state manager is recording or handling reject/update from server.
    private tasksWaitingTransitionFinish: (() => void)[] = []; //some task (like UI initialization) may need to wait for the transition to finish to get the correct state.

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

        this.record = this.record.bind(this);
        this.applyChange = this.applyChange.bind(this);
        this.clearPretendedChanges = this.clearPretendedChanges.bind(this);
        this.doAfterTransitionFinish = this.doAfterTransitionFinish.bind(this);
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
        newTopic.initialized = true;
        newTopic.onInit.invoke(newTopic.getValue());
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
        this.topics.delete(topicName);
        this.topicsToSetDetached.push(topic);
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
        //print(`Topic ${topicName} added. Now subscribed topics are:`, this.topics.keys());
        return topic as T;
    }

    /**
     * 
     * @param topicName The name of the topic to be removed.
     * @returns If need to notify server, return true. Otherwise, return false.
     */
    removeSubscription(topicName: string): boolean {
        if (!this.topics.has(topicName)) {
            //throw new Error(`Topic ${topicName} is not in the subscription.`);
            // This may happen when app does redundant clean up.
            return false;
        }
        let topic = this.getTopic(topicName)
        this.topics.delete(topicName);
        this.topicsToSetDetached.push(topic);
        //print(`Topic ${topicName} removed. Now subscribed topics are:`, this.topics.keys());
        return !topic.isPretended;
    }

    private setDoingTransition(callback: () => void): void{
        if (this.isDoingTransition)
            throw new Error("This function should not be reentrant by logic.");
        this.isDoingTransition = true;
        try{
            callback();
        }finally{
            this.isDoingTransition = false;
            for(const task of this.tasksWaitingTransitionFinish){
                task();
            }
            this.tasksWaitingTransitionFinish = [];
        }
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

        // Set isDoingTransition flag.
        if (!this.isDoingTransition){
            this.setDoingTransition(() => {
                this.record(callback,pretend);
            });
            return;
        }

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
            debugger// To see the stack trace in the console.
            throw e;
        }
        finally{
            if (!exceptionOccurred){
                const actionID = IdGenerator.generateId();
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

            this.processSetDetached();
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
        const actionID = IdGenerator.generateId();
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

        // Set isDoingTransition flag.
        if (!this.isDoingTransition){
            this.setDoingTransition(() => {
                this.handleUpdate(transition,actionID);
            });
            return;
        }
        
        this.blockApplyChangeContext(() => {
            for (const change of transition){
                
                
                if (!this.hasTopic(change.topicName))
                    continue; // This could happen when a topic is removed from previous changes in the transition.

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
        this.processSetDetached();
    }

    handleReject(): void{

        // Set isDoingTransition flag. //TODO: use decorator
        if (!this.isDoingTransition){
            this.setDoingTransition(() => {
                this.handleReject();
            });
            return;
        }

        /*Recieve a reject from the server.*/
        this.blockApplyChangeContext(() => {
            this.undo(this.allPreview.map(x => x.change));
            this.allPreview = [];
        });
        this.processSetDetached();
    }

    /**
     * After doing some pretended changes, call this function to clear those pretended changes.
     * @returns void
     */
    clearPretendedChanges(): void{

        // Set isDoingTransition flag.
        if (!this.isDoingTransition){
            this.setDoingTransition(() => {
                this.clearPretendedChanges();
            });
            return;
        }

        if(this.isRecording)
            throw new Error("Cannot clear pretended changes while recording.");
        
        this.blockApplyChangeContext(() => {
            this.undo(this.allPretendedChanges.map(x => x.change));
        });
        this.allPretendedChanges = [];
        this.processSetDetached();
    }

    doAfterTransitionFinish(callback: () => void): void{
        if(this.isDoingTransition){
            this.tasksWaitingTransitionFinish.push(callback);
        }else{
            callback();
        }
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

    private processSetDetached(): void{
        for(const topic of this.topicsToSetDetached){
            topic.setDetached();
        }
        this.topicsToSetDetached = [];
    }
}