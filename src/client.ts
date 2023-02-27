import { ChangeCommand, Command, CommandManager } from "./command";
import { Topic } from "./topic";
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
    private readonly topics: Map<string, Topic<any>>;
    private readonly commandManager: CommandManager;
    private readonly previewPath: ChangeCommand<any>[];
    private clientID: Number;
    private readonly requestPool: Map<string, Request>;
    private readonly servicePool: Map<string, (data: any) => any>;
    private readonly messageHandlers: Map<string, (data: any) => void>;
    private readonly onConnect: Action<[], void>;

    constructor(host: string){
        this.ws = new WebSocket(host);
        this.topics = new Map<string, Topic<any>>();
        this.commandManager = new CommandManager(this.onRecordingStop.bind(this), this.onAddCommand.bind(this));
        this.previewPath = new Array<ChangeCommand<any>>();
        this.clientID = -1;
        this.requestPool = new Map<string, Request>; 
        this.servicePool = new Map<string, (data: any) => void>();
        this.messageHandlers = new Map<string, (data: any) => void>([
            ['hello', this.handleHello.bind(this)],
            ['request', this.handleRequest.bind(this)],
            ['response', this.handleResponse.bind(this)],
            ['update', this.handleUpdate.bind(this)],
            ['reject_update', this.handleRejectUpdate.bind(this)],
        ]);

        this.onConnect = new Action<[], void>();
        
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

    private onRecordingStop(recordedCommands: Command[]) {
        const commandDicts = [];
        for (const command of recordedCommands) {
            if(command instanceof ChangeCommand)
            commandDicts.push(command.serialize());
        }
        this.sendToServer('client_update', { changes: commandDicts });
        this.commandManager.commit();
    }

    private onAddCommand(addedCommand: Command) {
        if (addedCommand instanceof ChangeCommand) {
            if (addedCommand.preview) {
                addedCommand.execute();
                this.previewPath.push(addedCommand);
            }
        }
    }

    private handleHello({id}: {id: number}) {
        this.clientID = id;
        console.debug(`[ChatRoom] Connected to server with client ID ${id}`);
        this.onConnect.invoke();
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

    private handleUpdate({changes}: {changes: any[]}) {
        for (const item of changes) {
            const topicName = item.topic_name;
            const changeDict = item.change;
            if (!this.topics.has(topicName)) { // This may happen when the client just unsubscribed from a topic.
                console.warn(`Received update for unknown topic ${topicName}`);
                continue;
            }
            const topic = defined(this.topics.get(topicName));
            const change = topic.deserializeChange(changeDict);

            if (this.previewPath.length > 0 && change.id == this.previewPath[0].change.id) {
                this.previewPath.shift();
            }
            else {
                this.undoAll(this.previewPath);
                while(this.previewPath.length>0){
                    this.previewPath.shift();
                }
                topic.applyChange(change);
            }

        }
    }

    private handleRejectUpdate({ topic_name, change, reason }: { topic_name: string, change: any, reason: string }) {
        console.warn(`Update rejected for topic ${topic_name}: ${reason}`, [...this.previewPath]);
        if(this.previewPath.length>0 && change.id == this.previewPath[0].change.id){
            this.undoAll(this.previewPath);
            while(this.previewPath.length>0){
                this.previewPath.shift();
            }
        }
        console.warn([...this.previewPath]);
    }

    public makeRequest(serviceName: string, args: any, onResponse : (response: any)=>void): void {
        const id = uuidv4();
        const request = new Request(id, onResponse);
        this.requestPool.set(id, request);
        this.sendToServer('request', { service_name: serviceName, args: args, request_id: id });
    }

    public registerService(serviceName: string, service: (data: any) => void) {
        this.servicePool.set(serviceName, service);
        this.sendToServer('register_service', { service_name: serviceName });
    }

    public registerTopic<T extends Topic<any>>(topic_name: string, topic_type: string|{ new(name: string, commandManager: CommandManager): T; }): T {
        if (typeof topic_type === 'string') {
            topic_type = Topic.GetTypeFromName(topic_type) as { new(name: string, commandManager: CommandManager): T; };
        }
        
        if (this.topics.has(topic_name)) {
            const topic = defined(this.topics.get(topic_name));
            return topic as T;
        }

        const topic = new topic_type(topic_name, this.commandManager);
        this.topics.set(topic_name, topic);
        this.sendToServer('subscribe', { topic_name: topic_name, type: topic.getTypeName() });
        return topic;
    }

        

    //TODO: Unregister topic

    public onConnected(callback: () => void) {
        this.onConnect.addCallback(callback);
    }

    private undoAll(commands: ChangeCommand<any>[]) { 
        for (let i = commands.length - 1; i >= 0; i--) {
            commands[i].undo();
        }
    }
}