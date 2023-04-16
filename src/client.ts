import { print } from "./devUtils";
import { StateManager } from "./stateManager";
import { SetTopic, Topic } from "./topic";
import { Change } from "./topicChange";
import { Action, defined } from "./utils";
import { v4 as uuidv4 } from 'uuid';

class Request{
    id: string;
    onResponse: (data: any) => void;
    constructor(id: string, onResponse: (data: any) => void = () => {}){
        this.id = id;
        this.onResponse = onResponse;
    }
}

export class ChatroomClient{
    private readonly ws: WebSocket;
    private readonly stateManager: StateManager;
    private clientID: Number;
    private readonly requestPool: Map<string, Request>;
    private readonly servicePool: Map<string, (data: any) => any>;
    private readonly messageHandlers: Map<string, (data: any) => void>;
    private readonly onConnect: Action<[], void>;
    private readonly topicSet: SetTopic;
    private onConnectCalled: boolean;
    private pendingSubscriptions: string[] = [];

    constructor(host: string){
        this.ws = new WebSocket(host);
        this.stateManager = new StateManager(this.onActionProduced.bind(this), this.onActionFailed.bind(this));
        this.clientID = -1;
        this.requestPool = new Map<string, Request>; 
        this.servicePool = new Map<string, (data: any) => void>();
        this.messageHandlers = new Map<string, (data: any) => void>([
            ['hello', this.handleHello.bind(this)],
            ['request', this.handleRequest.bind(this)],
            ['response', this.handleResponse.bind(this)],
            ['update', this.handleUpdate.bind(this)],
            ['reject', this.handleReject.bind(this)],
        ]);
        this.topicSet = this.stateManager.getTopic<SetTopic>("_chatroom/topics");

        this.onConnect = new Action<[], void>();
        this.onConnectCalled = false;
        
        this.ws.onmessage = (event) => {
            console.debug('>\t'+event.data);
            const data = JSON.parse(event.data);
            const messageType = data['type'];
            const args = data['args'];
            defined(this.messageHandlers.get(messageType))(args);
        }
    }

    private sendToServer(messageType: string, args: any) {
        const message = JSON.stringify({type: messageType, args: args});
        console.debug('<\t'+message);
        this.ws.send(message);
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
        this.clientID = id;
        console.debug(`[ChatRoom] Connected to server with client ID ${id}`);
        this.sendToServer('subscribe', { topic_name: "_chatroom/topics" });
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

    private handleUpdate({changes,action_id:actionId}: {changes: any[],action_id: string}) {
        const changeObjects = [];
        for (const changeDict of changes) {
            const topic = this.stateManager.getTopic(changeDict['topic_name']);
            const change = topic.deserializeChange(changeDict);
            changeObjects.push(change);
        }
        this.stateManager.handleUpdate(changeObjects,actionId);

        if (!this.onConnectCalled) {
            // when server sends the value of _chatroom/topics, client can do things about topics
            this.onConnectCalled = true;
            this.onConnect.invoke();
        }
    }

    private handleReject({ reason }: {reason: string }) {
        this.stateManager.handleReject();
    }

    public makeRequest(serviceName: string, args: any, onResponse : (response: any)=>void): void {
        const id = uuidv4();
        const request = new Request(id, onResponse);
        this.requestPool.set(id, request);
        this.sendToServer('request', { service_name: serviceName, args: args, request_id: id });
    }

    public getTopic<T extends Topic<any>>(topicName: string): T {

        if (this.stateManager.hasTopic(topicName)) {
            const topic = this.stateManager.getTopic(topicName);
            return topic as T;
        }
        if (this.stateManager.existsTopic(topicName)) {
            let topic = this.stateManager.subscribe(topicName);
            this.sendSubscribe(topicName);
            return topic as T;
        }
        throw new Error(`Topic ${topicName} does not exist`);
    }

    //? Should client be able to create and remove topics?
    public addTopic<T extends Topic<any>>(topicName: string, topicType: string|{ new(name: string, commandManager: StateManager): T; }): T {
        if (typeof topicType !== 'string') {
            topicType = Topic.GetNameFromType(topicType);
        }
        this.topicSet.append({topic_name: topicName, topic_type: topicType});
        let topic = this.stateManager.getTopic(topicName);
        return topic as T;
    } 

    public removeTopic(topicName: string) {
        for(const d of this.topicSet.getValue()) {
            if (d.topic_name === topicName) {       
                this.topicSet.remove(d);
                return;
            }
        }
    }

    public onConnected(callback: () => void) {
        this.onConnect.add(callback);
    }
}