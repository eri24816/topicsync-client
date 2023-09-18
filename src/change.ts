import { IdGenerator } from "./utils";
import { ValueSet } from "./collection";
import * as diff from "./stringDiff"
export type ConstructorOfChange<T, TI = T, TopicT extends Topic<T, TI> = Topic<T, TI>> = new (...args: any[]) => Change<T, TI, TopicT>

export class InvalidChangeException extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "InvalidChangeException";
        Object.setPrototypeOf(this, InvalidChangeException.prototype);
    }
}

interface ChangeDict {
    [key: string]: any;
}

export abstract class Change<T, TI = T, TopicT extends Topic<T, TI> = Topic<T, TI>> {
    id: string;
    private _topic: TopicT;
    get topic(): TopicT {
        // force casting here, we assume that the type of topic will remain the same even if
        // it was deleted and then added
        this._topic = this._topic.stateManager.getTopic(this._topic.getName()) as unknown as TopicT;
        return this._topic;
    }
    get topicName(): string{
        return this._topic.getName();
    }
    constructor(topic: TopicT,id?: string) {
        this._topic = topic;
        if (id) {
            this.id = id;
        } else {
            this.id = IdGenerator.generateId();
        }
    }

    public execute(): void {
        this.topic.applyChange(this);
    }

    abstract apply(oldValue: T): T;

    abstract serialize(): ChangeDict;

    abstract inverse(): Change<T, TI, TopicT>;

    public static deserialize<T, TI, TopicT extends Topic<T, TI>>(
        topic: Topic<T, TI>,
        changeType: ConstructorOfChange<T, TI, TopicT>,
        changeDict: ChangeDict
    ): Change<any> {
        const { type, ...rest } = changeDict;
        return new changeType(topic, rest)
    }
}

import deepcopy from "deepcopy";
import {StringTopic, Topic} from "./topic";
import { print } from "./devUtils"

interface SetChangeDict extends ChangeDict {
    type: "set";
    value: any;
    old_value: any;
}

class SetChange<T, TopicT extends Topic<T, T> = Topic<T, T>> extends Change<T, T, TopicT> {
    value: T;
    oldValue?: T; 
    constructor(topic: TopicT, {value, old_value, id}: {value: T, old_value?: T, id?: string}) {
        super(topic,id);
        this.value = value;
        this.oldValue = old_value;
    }

    apply(oldValue: T): T {
        this.oldValue = deepcopy(oldValue);
        return deepcopy(this.value);
    }

    serialize(): SetChangeDict {
        return {
            topic_name: this.topic.getName(),
            topic_type: this.topic.getTypeName(),
            type: "set",
            value: deepcopy(this.value),
            old_value: deepcopy(this.oldValue),
            id: this.id,
        };
    }

    inverse(): Change<T, T, TopicT> {
        if (this.oldValue === undefined) {
            throw new InvalidChangeException(`Cannot inverse SetChange before it is applied. Topic: ${this.topic.getName()}`);
        }
        return new SetChange<T, TopicT>(this.topic,
            { value: deepcopy(this.oldValue), old_value: deepcopy(this.value) }
        );
    }
}

export namespace GenericChangeTypes    {
    export const Set = SetChange;
}

export namespace StringChangeTypes    {
    export class Set extends SetChange<string, StringTopic> {

        constructor(topic: StringTopic, { value, old_value, id }: { value: string, old_value?: string, id?: string }) {
            super(topic, { value: value, old_value: old_value, id: id });
        }

        apply(oldValue: string): string {
            this.topic.updateVersion(this.topic.version, this.id)
            return super.apply(oldValue);
        }
    }

    export class Insert extends Change<string, string, StringTopic> {

        private readonly topicVersion: string
        public readonly position: number
        public readonly insertion: string
        private readonly resultTopicVersion: string
        constructor(topic: StringTopic,
                    { topic_version, position, insertion, result_topic_version, id } : { topic_version: string, position: number, insertion: string, result_topic_version?: string, id?: string }) {
            super(topic, id)
            this.topicVersion = topic_version
            this.position = position
            this.insertion = insertion
            this.resultTopicVersion = result_topic_version ?? IdGenerator.generateId()
        }


        apply(oldValue: string): string {
            try {
                this.topic.updateVersion(this.topicVersion, this.resultTopicVersion)
                return diff.insert(oldValue, this.position, this.insertion)
            } catch (e) {
                if (e instanceof Error) {
                    throw new InvalidChangeException(e.message)
                } else {
                    throw new InvalidChangeException(`unknown error happens at insert. ${e.toString()}`)
                }
            }
        }

        inverse(): Change<string, string, StringTopic> {
            return new StringChangeTypes.Delete(this.topic,
                {
                    topic_version: this.resultTopicVersion, position: this.position, deletion: this.insertion, result_topic_version: this.topicVersion
                })
        }

        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "insert",
                topic_version: this.topicVersion,
                position: this.position,
                insertion: this.insertion,
                result_topic_version: this.resultTopicVersion,
                id: this.id
            };
        }

    }

    export class Delete extends Change<string, string, StringTopic> {
        private readonly topicVersion: string
        public readonly position: number
        public readonly deletion: string
        private readonly resultTopicVersion: string
        constructor(topic: StringTopic, { topic_version, position, deletion, result_topic_version, id }: { topic_version: string, position: number, deletion: string, result_topic_version?: string, id?: string }) {
            super(topic, id)
            this.topicVersion = topic_version
            this.position = position
            this.deletion = deletion
            this.resultTopicVersion = result_topic_version ?? IdGenerator.generateId()
        }

        apply(oldValue: string): string {
            try {
                this.topic.updateVersion(this.topicVersion, this.resultTopicVersion)
                return diff.del(oldValue, this.position, this.deletion)
            } catch (e) {
                if (e instanceof Error) {
                    throw new InvalidChangeException(e.message)
                } else {
                    throw new InvalidChangeException(`unknown error happens at insert. ${e.toString()}`)
                }
            }
        }

        inverse(): Change<string, string, StringTopic> {
            return new StringChangeTypes.Insert(this.topic, {
                topic_version: this.resultTopicVersion, position: this.position, insertion: this.deletion, result_topic_version: this.topicVersion })
        }

        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "delete",
                topic_version: this.topicVersion,
                position: this.position,
                deletion: this.deletion,
                result_topic_version: this.resultTopicVersion,
                id: this.id
            };
        }

    }
}

export namespace IntChangeTypes    {
    export const Set = SetChange<number>;
    export class Add extends Change<number> {
        value: number;
        constructor(topic:Topic<number>, { value, id }: { value : number, id?: string }) {
            super(topic,id);
            this.value = value;
        }
        apply(oldValue: number): number {
            return oldValue + this.value;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "add",
                value: this.value,
                id: this.id,
            };
        }
        inverse(): Change<number> {
            return new Add(this.topic,{ value: -this.value });
        }
    }
}

export namespace FloatChangeTypes    {
    export const Set = SetChange<number>;
    export class Add extends Change<number> {
        value: number;
        constructor(topic:Topic<number>, { value, id }: { value: number, id?: string }) {
            super(topic,id);
            this.value = value;
        }
        apply(oldValue: number): number {
            return oldValue + this.value;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "add",
                value: this.value,
                id: this.id,
            };
        }
        inverse(): Change<number> {
            return new Add(this.topic, { value: -this.value });
        }
    }
}

export namespace SetChangeTypes    {
    export class Set extends Change<ValueSet, any[]> {
        value: ValueSet;
        oldValue?: ValueSet;
        constructor(topic:Topic<ValueSet,any[]>, {value, old_value, id}: { value: any[], old_value?: any[], id?: string }) {
            super(topic,id);
            this.value = new ValueSet(value);
            this.oldValue = old_value ? new ValueSet(old_value) : undefined;
        }
        apply(oldValue: ValueSet): ValueSet {
            this.oldValue = oldValue.copy();
            return this.value.copy();
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "set",
                value: this.value.toArray(),
                old_value: this.oldValue?.toArray(),
                id: this.id,
            };
        }
        inverse(): Change<ValueSet, any[]> {
            if (this.oldValue === undefined) {
                throw new InvalidChangeException(`Cannot inverse the change before it is applied. Topic: ${this.topic.getName()}`);
            }
            return new Set(this.topic, { value: this.oldValue.toArray(), old_value: this.value.toArray() });
        }
    }


    export class Append extends Change<ValueSet, any[]> {
        item: any;
        constructor(topic:Topic<ValueSet,any[]>, { item, id }: { item: any, id?: string }) {
            super(topic, id);
            this.item = item;
        }
        apply(oldValue: ValueSet): ValueSet {
            const newValue = oldValue.copy();//? copy?
            if (!newValue.add(this.item))
                throw new InvalidChangeException(`Item ${JSON.stringify(this.item)} already exists in set. Topic: ${this.topic.getName()}`)
            return newValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "append",
                item: this.item,
                id: this.id,
            };
        }
        inverse(): Change<ValueSet, any[]> {
            return new Remove(this.topic, { item: this.item });
        }
    }
    export class Remove extends Change<ValueSet, any[]> {
        item: any;
        constructor(topic:Topic<ValueSet,any[]>, { item, id }: { item: any, id?: string }) {
            super(topic, id);
            this.item = item;
        }
        apply(oldValue: ValueSet): ValueSet {
            const newValue = oldValue.copy();//? copy?
            if (!newValue.delete(this.item))
                throw new InvalidChangeException(`Item ${JSON.stringify(this.item)} not found in set. Topic: ${this.topic.getName()}`);
            return newValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "remove",
                item: this.item,
                id: this.id,
            };
        }
        inverse(): Change<ValueSet, any[]> {
            return new Append(this.topic, { item: this.item });
        }
    }
}

export namespace DictChangeTypes{
    export class Set<K,V> extends Change<Map<K,V>>{
        value: Map<K,V>;
        oldValue: Map<K,V>|null;
        constructor(topic:Topic<Map<K,V>>, { value, id }: { value:Map<K,V>|object, id?: string }) {
            super(topic,id);
            if(value instanceof Map){
                this.value = value;
            }else{
                this.value = new Map(Object.entries(value)) as Map<K,V>; // Assume that the type were verified by the server.
            }
            this.oldValue = null;
        }
        apply(oldValue: Map<K,V>): Map<K,V> {
            this.oldValue = oldValue;
            return this.value;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "set",
                value: this.value,
                old_value: this.oldValue,
                id: this.id,
            };
        }
        inverse(): Change<Map<K,V>>{
            return new Set(this.topic, { value: this.oldValue! });
        }
    }
    export class Add<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V;
        constructor(topic:Topic<Map<K,V>>, { key, value, id }: { key:K, value:V, id?: string }) {
            super(topic,id);
            this.key = key;
            this.value = value;
        }
        apply(oldValue: Map<K,V>): Map<K,V> {
            if (oldValue.has(this.key)) {
                throw new Error(`Adding ${this.key} to ${oldValue} would create a duplicate.`);
            }
            oldValue.set(this.key,this.value);
            return oldValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "add",
                key: this.key,
                value: this.value,
                id: this.id,
            };
        }
        inverse(): Change<Map<K,V>>{
            return new Pop(this.topic, { key: this.key });
        }
    }
    export class Pop<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V|null;
        constructor(topic:Topic<Map<K,V>>, { key, id }: { key:K, id?: string }) {
            super(topic,id);
            this.key = key;
            this.value = null;
        }
        apply(oldValue: Map<K,V>): Map<K,V> {
            if(!oldValue.has(this.key)){
                throw new InvalidChangeException(`${this.key} is not in ${oldValue}`);
            }
            this.value = oldValue.get(this.key)!;
            oldValue.delete(this.key);
            return oldValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "pop",
                key: this.key,
                id: this.id,
            };
        }
        inverse(): Change<Map<K,V>>{
            return new Add(this.topic, { key: this.key, value: this.value! });
        }
    }
    export class ChangeValue<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V;
        oldValue?: V;
        constructor(topic:Topic<Map<K,V>>, { key, value, old_value, id }: { key:K, value:V, old_value?:V, id?: string }) {
            super(topic,id);
            this.key = key;
            this.value = value;
            this.oldValue = old_value;
        }
        apply(oldDict: Map<K,V>): Map<K,V> {
            if(!oldDict.has(this.key)){
                throw new Error(`${this.key} is not in ${oldDict}`);
            }
            this.oldValue = oldDict.get(this.key)!;
            oldDict.set(this.key,this.value);
            return oldDict;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "change_value",
                key: this.key,
                value: this.value,
                old_value: this.oldValue,
                id: this.id,
            };
        }
        
        inverse(): Change<Map<K,V>>{
            return new ChangeValue(this.topic,
                { key: this.key, value: this.oldValue!, old_value: this.value }
            );
        }
    }
}

export namespace ListChangeTypes{
    export class Set<V> extends Change<Array<V>>{
        value: Array<V>;
        oldValue?: Array<V>;
        constructor(topic:Topic<Array<V>>, { value, old_value, id }: { value:Array<V>, old_value?:Array<V>, id?: string }) {
            super(topic,id);
            this.value = value;
            this.oldValue = old_value;
        }
        apply(oldValue: Array<V>): Array<V> {
            this.oldValue = oldValue.slice();
            oldValue.splice(0,oldValue.length,...this.value);
            return oldValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "set",
                value: this.value,
                old_value: this.oldValue,
                id: this.id,
            };
        }
        inverse(): Change<Array<V>>{
            return new Set(this.topic, { value: this.oldValue!, old_value: this.value });
        }
    }
    export class Insert<V> extends Change<Array<V>>{
        item: V;
        position: number;

        constructor(topic:Topic<Array<V>>, { item, position, id }: { item:V, position:number, id?: string }) {
            super(topic,id);
            this.item = item;
            this.position = position;
        }
        apply(oldValue: Array<V>): Array<V> {
            if(this.position < 0){
                this.position = oldValue.length + this.position;
            }
            oldValue.splice(this.position,0,this.item);
            return oldValue;
        }

        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "insert",
                item: this.item,
                position: this.position,
                id: this.id,
            };
        }
        inverse(): Change<Array<V>>{
            return new Pop(this.topic, { position: this.position });
        }
    }
    export class Pop<V> extends Change<Array<V>>{
        position: number;
        item?: V;
        constructor(topic:Topic<Array<V>>, { position, id }: { position:number, id?: string }) {
            super(topic,id);
            this.position = position;
        }
        apply(oldValue: Array<V>): Array<V> {
            if(this.position < 0){
                this.position = oldValue.length + this.position;
            }
            this.item = oldValue.splice(this.position,1)[0];
            return oldValue;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "pop",
                position: this.position,
                id: this.id,
            };
        }
        inverse(): Change<Array<V>>{
            return new Insert(this.topic, { item: this.item!, position: this.position });
        }
    }
}
            

export namespace EventChangeTypes{
    export class Emit extends Change<null> {
        args: any;
        constructor(topic:Topic<null>, { args, id }: { args:any, id?: string }) {
            super(topic,id);
            this.args = args;
        }
        apply(oldValue: null): null {
            return null;
        }
        serialize(): ChangeDict {
            return {
                topic_name: this.topic.getName(),
                topic_type: this.topic.getTypeName(),
                type: "emit",
                args: this.args,
                id: this.id,
            };
        }
        inverse(): Change<null>{
            throw new Error("Cannot inverse an emit change");
        }
    }
}