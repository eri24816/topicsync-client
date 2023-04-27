import { ChatroomClient } from "./client";
import { SetTopic, Topic } from "./topic";
import { defined } from "./utils";
import { print } from "./devUtils";

export class TopicsMonitor{
    container: HTMLElement;
    table: HTMLTableElement; 
    rows: Map<string,HTMLTableRowElement>;
    topicList: SetTopic;
    topics: Map<string, Topic<any>>;
    client: ChatroomClient;
    constructor(container: HTMLElement, client: ChatroomClient) {
        this.container = container;
        this.table = document.createElement('table');
        // monospace font
        this.table.style.fontFamily = 'consolas, monospace';
        this.table.style.borderCollapse = 'collapse';
        this.rows = new Map<string, HTMLTableRowElement>();

        this.client = client;

        this.topics = new Map<string, Topic<any>>();

        // add th
        const header = document.createElement('tr');
        header.innerHTML = '<th>Topic Name</th><th>Type</th><th>Value</th>';
        //align left
        for (const cell of header.children as HTMLCollectionOf<HTMLElement>) {
            cell.style.textAlign = 'left';
            cell.style.paddingLeft = '5px';
            cell.style.paddingRight = '5px';
            cell.style.border = '1px solid #000000';
            cell.style.borderCollapse = 'collapse';
        }
        this.table.appendChild(header);

        this.container.appendChild(this.table);
        this.topicList = client.getTopic<SetTopic>('_chatroom/topics');
        this.topicList.onAppend.add(this.topicAdded.bind(this));
        this.topicList.onRemove.add(this.topicRemoved.bind(this));
        for(const topic of this.topicList.getValue()){
            this.topicAdded(topic);
        }
    }

    private topicAdded({ topic_name, topic_type }: { topic_name: string, topic_type: string }): void{
        const topic = this.client.getTopic(topic_name)
        topic.onSet.add((value) => {
            //print('topic changed:', topic_name, JSON.stringify(value));
            print(`${topic_name} changed to ${JSON.stringify(value)}`);
            defined(row.children[2]).textContent = JSON.stringify(value);
        });
        this.topics.set(topic_name, topic);
        
        const row = document.createElement('tr');
        row.innerHTML = `<td>${topic_name}</td><td>${topic_type}</td><td>${JSON.stringify(topic.getValue())}</td>`;
        // padding left
        for(const cell of row.children as HTMLCollectionOf<HTMLElement>){
            cell.style.paddingLeft = '5px';
            cell.style.paddingRight = '5px';
            cell.style.border = '1px solid #000000';
            cell.style.borderCollapse = 'collapse';
        }
        this.table.appendChild(row);
        this.rows.set(topic_name, row);
    }

    private topicRemoved({topic_name,type}: { topic_name: string, type: string }): void{
        const row = defined(this.rows.get(topic_name));
        this.table.removeChild(row);
        this.rows.delete(topic_name);
        this.topics.delete(topic_name);
        this.client.unsubscribe(topic_name);
    }

}