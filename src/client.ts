import { print } from "./devUtils";
import { StateManager } from "./stateManager";
import { DictTopic, EventTopic, SetTopic, Topic } from "./topic";
import { Change } from "./change";
import { Action, Constructor, IdGenerator, defined, json_stringify } from "./utils";
import { BSON } from "./bson"

class Request{
    id: string;
    onResponse: (data: any) => void;
    constructor(id: string, onResponse: (data: any) => void = () => {}){
        this.id = id;
        this.onResponse = onResponse;
    }
}

export class TopicsyncClient{
    private readonly ws: WebSocket;
    private readonly stateManager: StateManager;
    private _clientId: number;
    private readonly requestPool: Map<string, Request>;
    private readonly servicePool: Map<string, (data: any) => any>;
    private readonly messageHandlers: Map<string, (data: any) => void>;
    private readonly onConnect: Action<[], void>;
    private readonly topicList: DictTopic<string,any>;
    private onConnectCalled: boolean;
    private pendingSubscriptions: string[] = [];
    private messagesWaitingForConnect: string[] = [];
    get clientId(): number{
        return this._clientId;
    }
    record: (callback?: () => void, pretend?: boolean) => void
    clearPretendedChanges: () => void
    doAfterTransitionFinish: (callback: () => void) => void
    private pretendedTopics: DictTopic<string,string>;

    constructor(host: string, onConnectionClosed: () => void = () => {}){
        this.ws = new WebSocket(host);
        this.stateManager = new StateManager(this.onActionProduced.bind(this), this.onActionFailed.bind(this));
        this.record = this.stateManager.record;
        this.clearPretendedChanges = this.stateManager.clearPretendedChanges;
        this.doAfterTransitionFinish = this.stateManager.doAfterTransitionFinish;
        this._clientId = -1;
        this.requestPool = new Map<string, Request>; 
        this.servicePool = new Map<string, (data: any) => void>();
        this.messageHandlers = new Map<string, (data: any) => void>([
            ['hello', this.handleHello.bind(this)],
            ['request', this.handleRequest.bind(this)],
            ['response', this.handleResponse.bind(this)],
            ['init', this.handleInit.bind(this)],
            ['update', this.handleUpdate.bind(this)],
            ['reject', this.handleReject.bind(this)],
        ]);
        this.topicList = this.stateManager.addSubsciption("_topicsync/topic_list",DictTopic<string,any>);
        this.onConnect = new Action<[], void>();
        this.onConnectCalled = false;
        this.pretendedTopics = this.stateManager.addSubsciption("_topicsync/pretended_topics",DictTopic<string,string>);
        this.pretendedTopics.onAdd.add((topicName: string, topicType:string) => {
            this.stateManager.addPretendedTopic(topicName,topicType);
        });
        this.pretendedTopics.onPop.add((topicName: string) => {
            this.stateManager.removePretendedTopic(topicName);
        });
        this.ws.binaryType = 'arraybuffer';
        this.ws.onmessage = (event) => {
            console.debug('>\t'+event.data);
            // determine json or bson
            let data;
            if (typeof event.data === 'string') {
                data = JSON.parse(event.data);
            }
            else {
                let buf: ArrayBuffer = event.data;
                data = BSON.deserialize(new Uint8Array(buf));
            }
            const messageType = data['type'];
            const args = data['args'];
            defined(this.messageHandlers.get(messageType))(args);
        }
        this.ws.onclose = onConnectionClosed
    }

    private sendToServer(messageType: string, args: any) {
        const message = json_stringify({type: messageType, args: args});
        console.debug('<\t'+message);
        if(this.ws.readyState === WebSocket.CONNECTING){
            this.messagesWaitingForConnect.push(message);
        }else{
            this.ws.send(message);
        }
    }

    private sendSubscribe(topicName: string) {
        // Client must send a subscribe message after the current action is sent
        // because the target topic of the subscription may be created by the action.
        if(this.stateManager.getIsRecording()) {
            this.pendingSubscriptions.push(topicName);
        }
        else {
            this.sendToServer('subscribe', { topic_name: topicName });
        }
    }

    private onActionProduced(recordedCommands: Change<any>[],actionID: string) {
        const commandDicts = [];
        for (const command of recordedCommands) {
            commandDicts.push(command.serialize());
        }
        this.sendToServer('action', { commands: commandDicts, action_id: actionID });
        for(const topicName of this.pendingSubscriptions) {
            this.sendToServer('subscribe', { topic_name: topicName })
        }
        this.pendingSubscriptions = [];
    }

    private onActionFailed() {
        this.pendingSubscriptions = [];
    }

    private handleHello({id}: {id: number}) {
        this._clientId = id;
        IdGenerator.instance = new IdGenerator(id+'');
        console.debug(`[TopicSync] Connected to server with client ID ${id}`);
        this.sendToServer('subscribe', { topic_name: "_topicsync/topic_list" });
    }

    private handleRequest({service_name: serviceName,args,request_id:requestId}: {service_name: string, args: any, request_id: string}) {
        if (this.servicePool.has(serviceName)) {
            const service = defined(this.servicePool.get(serviceName));
            let response = service(args);
            if (response === undefined)
                response = null;
            this.sendToServer('response', { request_id: requestId, response: response });
        }
        else {
            this.sendToServer('response', { request_id: requestId, response: null }); //TODO: Send error message
        }
    }

    private handleResponse({ request_id:requestId, response }: { request_id: string, response: any }) {
        const request = defined(this.requestPool.get(requestId));
        this.requestPool.delete(requestId);
        request.onResponse(response);
    }

    private handleInit({topic_name:topicName,value:value,...rest}: {topic_name: string, value: any}) {
        if(!this.stateManager.hasTopic(topicName))
            return;
        const topic = this.stateManager.getTopic(topicName);
        if(topic instanceof EventTopic)
            return;
        
        let changeDict = {
            topic_name: topicName,
            topic_type: "unknown",
            type: "set",
            value: value,
            ...rest
        }

        const change = topic.deserializeChange(changeDict);
        this.stateManager.handleUpdate([change],"init");
        topic.initialized = true;
        topic.onInit.invoke(value);

        if (!this.onConnectCalled) {
            // when server sends the value of _topicsync/topics, client can do things about topics
            this.onConnectCalled = true;
            this.onConnect.invoke();
            
            for(const message of this.messagesWaitingForConnect){
                this.ws.send(message);
            }
            this.messagesWaitingForConnect = [];
        }
    }

    private handleUpdate({changes,action_id:actionId}: {changes: any[],action_id: string}) {
        const changeObjects = [];
        for (const changeDict of changes) {
            if (!this.stateManager.hasTopic(changeDict.topic_name))
                continue; // This could happen when client subscribed a topic while the update message was in flight.
            const topic = this.stateManager.getTopic(changeDict.topic_name);
            const change = topic.deserializeChange(changeDict);
            changeObjects.push(change);
        }
        this.stateManager.handleUpdate(changeObjects,actionId);
    }

    private handleReject({ reason }: {reason: string }) {
        this.stateManager.handleReject();
    }

    public makeRequest(serviceName: string, args: any, onResponse : (response: any)=>void = ()=>{}): void {
        const id = IdGenerator.generateId();
        const request = new Request(id, onResponse);
        this.requestPool.set(id, request);
        this.sendToServer('request', { service_name: serviceName, args: args, request_id: id });
    }

    public addPretendedTopic(topicName: string, topicType: string):Topic<any> {
        this.pretendedTopics.add(topicName,topicType);
        return this.stateManager.getTopic(topicName);
    }
    
    /**
     * Get a topic object. Subscribe to the topic if it is not subscribed.
     * @param topicName The topic's name.
     * @param topicType The topic's type. Required if the topic is not subscribed.
     * @returns The topic object.
     */
    public getTopic<T extends Topic<any>>(topicName: string,topicType?: string|Constructor<T>,subscribe=true): T {
        if (this.stateManager.hasTopic(topicName)) {
            const topic = this.stateManager.getTopic(topicName);
            return topic as T;
        }
        // Try to query topic type from this.topicSet
        if (topicType === undefined){
            topicType = this.topicList.get(topicName)['type']
            if (topicType === undefined){
                throw new Error(`Type of topic ${topicName} is unknown. Please specify the topic type.`);
            }
        }
        let topic: T;
        if(this.stateManager.isPretending){
            let topicTypeName:string;
            if(typeof topicType === 'string')
                topicTypeName = topicType;
            else
                topicTypeName = Topic.GetNameFromType(topicType);
            this.pretendedTopics.add(topicName,topicTypeName);
            topic = this.stateManager.getTopic(topicName);
        }
        else{
            topic = this.stateManager.addSubsciption(topicName,topicType);
            if(subscribe){
                this.sendSubscribe(topicName);
            }
        }
        return topic as T;
    }

    /**
     * Unsubscribe from a topic.
     * The topic will not ever receive updates from the server. The topic will be marked as detached.
     * @param topicName The topic's name.
     */
    public unsubscribe(topicName: string, becauseRemoved: boolean = false) {
        if(topicName==="_topicsync/topic_list")
            throw new Error(`Cannot unsubscribe from topic ${topicName}`);
        let notifyServer = this.stateManager.removeSubscription(topicName);
        if(notifyServer)
            this.sendToServer('unsubscribe', { topic_name: topicName });
    }

    get allSubscribedTopics(): Map<string, Topic<any>> {
        return this.stateManager.allSubscribedTopics;
    }

    public onConnected(callback: () => void) {
        this.onConnect.add(callback);
    }

    public on(event_name: string, callback: (args:any) => void, sendSubscribe: boolean = true) {
        const topic = this.getTopic(event_name,EventTopic,sendSubscribe);
        topic.onEmit.add(callback);
    }

    public emit(event_name: string, args: any, sendSubscribe: boolean = false) {
        const topic = this.getTopic(event_name,EventTopic,sendSubscribe);
        topic.emit(args);
    }
}