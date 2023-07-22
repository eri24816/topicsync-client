import { IdGenerator } from "./utils";
import { ValueSet } from "./collection";
export type ConstructorOfChange<T> = new (...args: any[]) => Change<T>

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

export abstract class Change<T> {
    id: string;
    private _topic: Topic<T>;
    get topic(): Topic<T> {
        this._topic = this._topic.stateManager.getTopic(this._topic.getName());
        return this._topic;
    }
    get topicName(): string{
        return this._topic.getName();
    }
    constructor(topic: Topic<T>,id?: string) {
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

    abstract inverse(): Change<T>;

    public static deserialize(
        topic: Topic<any>,
        changeType: ConstructorOfChange<any>,
        changeDict: ChangeDict
    ): Change<any> {
        const { type, ...rest } = changeDict;
        switch (changeType) {
            case StringChangeTypes.Set:
                return new StringChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
            case IntChangeTypes.Set:
                return new IntChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
            case IntChangeTypes.Add:
                return new IntChangeTypes.Add(topic,rest.value, rest.id);
            case FloatChangeTypes.Set:
                return new FloatChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
            case FloatChangeTypes.Add:
                return new FloatChangeTypes.Add(topic,rest.value, rest.id);
            case SetChangeTypes.Set:
                return new SetChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
            case SetChangeTypes.Append:
                return new SetChangeTypes.Append(topic,rest.item, rest.id);
            case SetChangeTypes.Remove:
                return new SetChangeTypes.Remove(topic,rest.item, rest.id);
            case DictChangeTypes.Set:
                return new DictChangeTypes.Set(topic,new Map(Object.entries(rest.value)), rest.id);
            case DictChangeTypes.Add:
                return new DictChangeTypes.Add(topic,rest.key, rest.value, rest.id);
            case DictChangeTypes.Remove:
                return new DictChangeTypes.Remove(topic,rest.key, rest.id);
            case DictChangeTypes.ChangeValue:
                return new DictChangeTypes.ChangeValue(topic,rest.key, rest.value, rest.old_value, rest.id);
            case ListChangeTypes.Set:
                return new ListChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
            case ListChangeTypes.Insert:
                return new ListChangeTypes.Insert(topic,rest.item, rest.position, rest.id);
            case ListChangeTypes.Pop:
                return new ListChangeTypes.Pop(topic,rest.index, rest.id);
            default:
                throw new Error(`Unknown change type: ${topic.getTypeName()} ${type}`);
        }
    }
}

import deepcopy from "deepcopy";
import { Topic } from "./topic";
import { print } from "./devUtils"

interface SetChangeDict extends ChangeDict {
    type: "set";
    value: any;
    old_value: any;
}

class SetChange<T> extends Change<T> {
    value: T;
    oldValue?: T; 

    constructor(topic:Topic<T> ,value: T, old_value?: T, id?: string) {
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

    inverse(): Change<T> {
        if (this.oldValue === undefined) {
            throw new InvalidChangeException(`Cannot inverse SetChange before it is applied. Topic: ${this.topic.getName()}`);
        }
        return new SetChange<T>(this.topic,deepcopy(this.oldValue), deepcopy(this.value));
    }
}

export namespace GenericChangeTypes    {
    export const Set = SetChange;
}

export namespace StringChangeTypes    {
    export const Set = SetChange<string>;
}

export namespace IntChangeTypes    {
    export const Set = SetChange<number>;
    export class Add extends Change<number> {
        value: number;
        constructor(topic:Topic<number>, value: number, id?: string) {
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
            return new Add(this.topic,-this.value);
        }
    }
}

export namespace FloatChangeTypes    {
    export const Set = SetChange<number>;
    export class Add extends Change<number> {
        value: number;
        constructor(topic:Topic<number>, value: number, id?: string) {
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
            return new Add(this.topic,-this.value);
        }
    }
}

export namespace SetChangeTypes    {
    export class Set extends Change<ValueSet> {
        value: ValueSet;
        oldValue?: ValueSet;
        constructor(topic:Topic<ValueSet,any>, value: any[], old_value?: any[], id?: string) {
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
        inverse(): Change<ValueSet> {
            if (this.oldValue === undefined) {
                throw new InvalidChangeException(`Cannot inverse the change before it is applied. Topic: ${this.topic.getName()}`);
            }
            return new Set(this.topic,this.oldValue.toArray(), this.value.toArray()); 
        }
    }


    export class Append extends Change<ValueSet> {
        item: any;
        constructor(topic:Topic<ValueSet,any>, item: any, id?: string) {
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
        inverse(): Change<ValueSet> {
            return new Remove(this.topic,this.item);
        }
    }
    export class Remove extends Change<ValueSet> {
        item: any;
        constructor(topic:Topic<ValueSet,any>, item: any, id?: string) {
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
        inverse(): Change<ValueSet> {
            return new Append(this.topic,this.item);
        }
    }
}

export namespace DictChangeTypes{
    export class Set<K,V> extends Change<Map<K,V>>{
        value: Map<K,V>;
        oldValue: Map<K,V>|null;
        constructor(topic:Topic<Map<K,V>>, value:Map<K,V>, id?: string) {
            super(topic,id);
            this.value = value;
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
            return new Set(this.topic,this.oldValue!);
        }
    }
    export class Add<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V;
        constructor(topic:Topic<Map<K,V>>, key:K, value:V, id?: string) {
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
            return new Remove(this.topic,this.key);
        }
    }
    export class Remove<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V|null;
        constructor(topic:Topic<Map<K,V>>, key:K, id?: string) {
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
                type: "remove",
                key: this.key,
                id: this.id,
            };
        }
        inverse(): Change<Map<K,V>>{
            return new Add(this.topic,this.key,this.value!);
        }
    }
    export class ChangeValue<K,V> extends Change<Map<K,V>>{
        key: K;
        value: V;
        oldValue?: V;
        constructor(topic:Topic<Map<K,V>>, key:K, value:V, old_value?:V, id?: string) {
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
            return new ChangeValue(this.topic,this.key,this.oldValue!,this.value);
        }
    }
}

export namespace ListChangeTypes{
    export class Set<V> extends Change<Array<V>>{
        value: Array<V>;
        oldValue?: Array<V>;
        constructor(topic:Topic<Array<V>>, value:Array<V>, old_value?:Array<V>, id?: string) {
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
            return new Set(this.topic,this.oldValue!,this.value);
        }
    }
    export class Insert<V> extends Change<Array<V>>{
        item: V;
        position: number;

        constructor(topic:Topic<Array<V>>, item:V, position:number, id?: string) {
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
            return new Pop(this.topic,this.position);
        }
    }
    export class Pop<V> extends Change<Array<V>>{
        position: number;
        item?: V;
        constructor(topic:Topic<Array<V>>, position:number, id?: string) {
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
            return new Insert(this.topic,this.item!,this.position);
        }
    }
}
            

export namespace EventChangeTypes{
    export class Emit extends Change<null> {
        args: any;
        constructor(topic:Topic<null>, args:any, id?: string) {
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