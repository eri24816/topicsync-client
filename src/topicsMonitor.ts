import { ChatroomClient } from "./client";
import { DictTopic, SetTopic, Topic } from "./topic";
import { defined, json_stringify } from "./utils";
import { print } from "./devUtils";

function compare_prefix(a: string, b: string): number{
    for (let i = 0; i < a.length && i < b.length; i++) {
        let ai = a[i];
        let bi = b[i];
        if (ai == '_') ai = '\0';
        if (bi == '_') bi = '\0';
        if(ai < bi){
            return -1;
        }
        if (ai > bi){
            return 1;
        }
    }
    if (a.length < b.length) {
        return -1;
    }
    if (a.length > b.length) {
        return 1;
    }
    return 0;
}

function compare(a: string, b: string,sep:string){
    let a_split = a.split(sep);
    let b_split = b.split(sep);
    let i = 0;
    while(i < a_split.length && i < b_split.length){
        if(compare_prefix(a_split[i],b_split[i])==-1){
            return false;
        }
        if(compare_prefix(a_split[i],b_split[i])==1){
            return true;
        }
        i++;
    }
    return true;
}

export class TopicsMonitor{
    container: HTMLElement;
    table: HTMLTableElement; 
    rows: Map<string,HTMLTableRowElement>;
    topicList: DictTopic<string,any>;
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
        this.topicList = client.getTopic<DictTopic<string,any>>('_chatroom/topic_list');
        this.topicList.onAdd.add(this.topicAdded.bind(this));
        this.topicList.onRemove.add(this.topicRemoved.bind(this));
        for(const [topic,props] of this.topicList.getValue().entries()){
            this.topicAdded(topic,props);
        }
    }

    private topicAdded(topic_name:string,props:any): void{
        const topic = this.client.getTopic(topic_name)
        topic.onSet.add((value) => {
            //print('topic changed:', topic_name, json_stringify(value));
            print(`${topic_name} changed to ${json_stringify(value)}`);
            defined(row.children[2]).textContent = json_stringify(value);
        });
        this.topics.set(topic_name, topic);
        
        const row = document.createElement('tr');
        row.innerHTML = `<td>${topic_name}</td><td>${props['type']}</td><td>${json_stringify(topic.getValue())}</td>`;
        // padding left
        for(const cell of row.children as HTMLCollectionOf<HTMLElement>){
            cell.style.paddingLeft = '5px';
            cell.style.paddingRight = '5px';
            cell.style.border = '1px solid #000000';
            cell.style.borderCollapse = 'collapse';
        }
        //sort
        let next = this.table.children[1];
        while(next != null && !compare(next.children[0].textContent!,topic_name,'/')){
            next = next.nextElementSibling!;
        }
        this.table.insertBefore(row, next);
        this.rows.set(topic_name, row);
    }

    private topicRemoved(topic_name:string): void{
        const row = defined(this.rows.get(topic_name));
        this.table.removeChild(row);
        this.rows.delete(topic_name);
        this.topics.delete(topic_name);
        this.client.unsubscribe(topic_name);
    }

}