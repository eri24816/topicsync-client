import { print } from "./dev_utils";
import { StateManager } from "./state_manager";
import { SetTopic, Topic } from "./topic";
import { Change } from "./topicChange";
import { Action, defined } from "./utils";
import { v4 as uuidv4 } from 'uuid';

class Request{
    id: string;
    on_response: (data: any) => void;
    constructor(id: string, on_response: (data: any) => void = () => {}){
        this.id = id;
        this.on_response = on_response;
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
            const message_type = data['type'];
            const args = data['args'];
            defined(this.messageHandlers.get(message_type))(args);
        }
    }

    private sendToServer(message_type: string, args: any) {
        const message = JSON.stringify({type: message_type, args: args});
        console.debug('<\t'+message);
        this.ws.send(message);
    }

    private sendSubscribe(topicName: string) {
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
        request.on_response(response);
    }

    private handleUpdate({changes,action_id}: {changes: any[],action_id: string}) {
        const change_objects = [];
        for (const change_dict of changes) {
            const topic = this.stateManager.getTopic(change_dict['topic_name']);
            const change = topic.deserializeChange(change_dict);
            change_objects.push(change);
        }
        this.stateManager.handleUpdate(change_objects,action_id);

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

    public getTopic<T extends Topic<any>>(topic_name: string): T {

        if (this.stateManager.hasTopic(topic_name)) {
            const topic = this.stateManager.getTopic(topic_name);
            return topic as T;
        }
        if (this.stateManager.existsTopic(topic_name)) {
            let topic = this.stateManager.subscribe(topic_name);
            this.sendSubscribe(topic_name);
            return topic as T;
        }
        throw new Error(`Topic ${topic_name} does not exist`);
    }

    //? Should client be able to create and remove topics?
    public addTopic<T extends Topic<any>>(topic_name: string, topic_type: string|{ new(name: string, commandManager: StateManager): T; }): T {
        if (typeof topic_type !== 'string') {
            topic_type = Topic.GetNameFromType(topic_type);
        }
        this.topicSet.append({topic_name: topic_name, topic_type: topic_type});
        let topic = this.stateManager.getTopic(topic_name);
        return topic as T;
    } 

    public removeTopic(topic_name: string) {
        for(const d of this.topicSet.getValue()) {
            if (d.topic_name === topic_name) {       
                this.topicSet.remove(d);
                return;
            }
        }
    }

    public onConnected(callback: () => void) {
        this.onConnect.addCallback(callback);
    }
}