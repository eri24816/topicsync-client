import { Action, camelToSnake, defined } from './utils';
import { Change, InvalidChangeException, StringChangeTypes, SetChangeTypes as SetChangeTypes, ConstructorOfChange, IntChangeTypes, FloatChangeTypes, GenericChangeTypes, EventChangeTypes, DictChangeTypes, ListChangeTypes } from './change';
import {StateManager} from './stateManager';
import deepcopy from 'deepcopy';
import { ValueSet } from './collection';

type Validator<T> = (oldValue: T, change: Change<T>) => boolean;

interface ChangeDict {
  type: string;
  [key: string]: any;
}

export abstract class Topic<T,TI=T>{
    static getTypeDict(): {[key:string]:{ new(name: string, commandManager: StateManager): Topic<any>; }}
    {
        return {
            generic: GenericTopic,
            string: StringTopic,
            int: IntTopic,
            float: FloatTopic,
            set: SetTopic,
            dict: DictTopic,
            list: ListTopic,
            event: EventTopic,
        }
    }
    static GetTypeFromName(name: string): { new(name: string, commandManager: StateManager): Topic<any>; }{
        return Topic.getTypeDict()[name];
    }
    static GetNameFromType(type: { new(name: string, commandManager: StateManager): Topic<any>; }): string{
        return camelToSnake(type.name.replace('Topic',''));
    }
    protected name: string;
    protected abstract value: T;
    private commandManager: StateManager;
    private validators: Validator<T>[];
    private noPreviewChangeTypes: Set<ConstructorOfChange<T>>;
    public abstract readonly changeTypes: { [key: string]: ConstructorOfChange<T> }
    public onSet = new Action<[TI],void>;
    public onSet2 = new Action<[TI,TI],void>;
    private detached: boolean;
    constructor(name:string,commandManager:StateManager){
        this.name = name;
        this.commandManager = commandManager;
        this.validators = [];
        this.noPreviewChangeTypes = new Set();
        this.detached = false;
    }
    public getTypeName(): string{
        return camelToSnake(this.constructor.name.replace('Topic',''));
    }

    public getName(): string{
        return this.name;
    }

    public getValue(): TI{
        this.checkDetached();
        return this._getValue();
    }

    protected abstract _getValue(): TI;

    public addValidator(validator: Validator<T>): void{
        this.validators.push(validator);
    }

    public disablePreview(changeType?: ConstructorOfChange<T>): void{
        if (changeType === undefined) {
            this.noPreviewChangeTypes = new Set(Object.values(this.changeTypes));
        }
        else {
            this.noPreviewChangeTypes.add(changeType);
        }
    }

    public enablePreview(changeType?: ConstructorOfChange<T>): void{
        if (changeType === undefined) {
            this.noPreviewChangeTypes.clear();
        }
        else {
            this.noPreviewChangeTypes.delete(changeType);
        }
    }

    public abstract set(value:TI): void;
    
    protected notifyListeners(change: Change<T>, oldValue: TI, newValue: TI): void{
        this.onSet.invoke(this.getValue());
        this.onSet2.invoke(oldValue,this.getValue());
    }

    protected notifyListenersT(change: Change<T>, oldValue: T, newValue: T): void{}

    private validateChange(change: Change<T>): void{
        const oldValue = this.value;
        for (const validator of this.validators) {
            if (!validator(oldValue, change)) {
                throw new InvalidChangeException(`Change ${change.serialize()} is not valid for topic ${this.name}. Old value: ${oldValue}`);
            }
        }
    }

    public applyChange(change: Change<T>): void{
        this.validateChange(change);
        const oldValueTI = this.getValue();
        const oldValueT = this.value;
        this.value = change.apply(this.value);
        const newValueTI = this.getValue();
        const newValueT = this.value;
        this.notifyListenersT(change, oldValueT, newValueT);
        this.notifyListeners(change, oldValueTI, newValueTI);
    }

    public applyChangeExternal(change: Change<T>): void{
        this.checkDetached();
        this.validateChange(change);
        let preview = true;
        for (const changeType of this.noPreviewChangeTypes) {
            if (change instanceof changeType) {
                preview = false;
                break;
            }
        }
        this.commandManager.applyChange(change,preview);
    
    }

    public deserializeChange(changeDict: ChangeDict): Change<T> {
        const { type, ...rest } = changeDict;
        const changeType = this.changeTypes[type];
        return Change.deserialize(this,changeType,changeDict);
    }

    public setDetached(): void{
        // When the topic is detached from the server, it cannot be used anymore.
        this.detached = true;
    }

    private checkDetached(): void{
        if (this.detached) {
            throw new Error(`The topic ${this.name} has been removed or unsubscribed. You cannot use it anymore.`);
        }
    }
}

export class GenericTopic<T> extends Topic<T>{
    public changeTypes = {
        'set': GenericChangeTypes.Set<T>,
    }
    protected value!: T
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
    }

    protected _getValue(): T {
        return this.value;
    }

    public set(value: T): void{
        this.applyChangeExternal(new GenericChangeTypes.Set(this,value));
    }
}

export class StringTopic extends Topic<string>{
    public changeTypes = {
        'set': StringChangeTypes.Set,
    }
    protected value: string;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = '';
    }

    protected _getValue(): string {
        return this.value;
    }

    public set(value: string): void{
        this.applyChangeExternal(new StringChangeTypes.Set(this,value));
    }
}

export class IntTopic extends Topic<number>{
    public changeTypes = {
        'set': IntChangeTypes.Set,
        'add': IntChangeTypes.Add
    }
    protected value: number;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = 0;
    }

    protected _getValue(): number {
        return this.value;
    }

    public set(value: number): void{
        this.applyChangeExternal(new IntChangeTypes.Set(this,value));
    }

    public add(value: number): void{
        this.applyChangeExternal(new IntChangeTypes.Add(this,value));
    }
}

export class FloatTopic extends Topic<number>{
    public changeTypes = {
        'set': FloatChangeTypes.Set,
        'add': FloatChangeTypes.Add
    }
    protected value: number;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = 0;
    }

    protected _getValue(): number {
        return this.value;
    }

    public set(value: number): void{
        this.applyChangeExternal(new FloatChangeTypes.Set(this,value));
    }

    public add(value: number): void{
        this.applyChangeExternal(new FloatChangeTypes.Add(this,value));
    }
}

export class SetTopic extends Topic<ValueSet,any[]>{
    public changeTypes = {
        'set': SetChangeTypes.Set,
        'append': SetChangeTypes.Append,
        'remove': SetChangeTypes.Remove,
    }
    onAppend: Action<[any], void>;
    onRemove: Action<[any], void>;
    protected value: ValueSet;
    constructor(name:string,commandManager:StateManager,initValue?:any[]){
        super(name,commandManager);
        this.value = new ValueSet();
        this.onAppend = new Action();
        this.onRemove = new Action();
        if (initValue !== undefined) // for _chatroom/topic_list
            this.value.setValues(initValue);
    }

    protected _getValue(): any[] {
        return this.value.toArray();
    }

    public set(value: any[]): void{
        this.applyChangeExternal(new SetChangeTypes.Set(this,value));
    }

    public append(value: any): void{
        this.applyChangeExternal(new SetChangeTypes.Append(this,value));
    }

    public remove(value: any): void{
        this.applyChangeExternal(new SetChangeTypes.Remove(this,value));
    }

    protected notifyListenersT(change: Change<ValueSet>, oldValue: ValueSet, newValue: ValueSet): void{
        if (change instanceof SetChangeTypes.Set) {
            for(const value of oldValue.toArray())
                if (!newValue.has(value))
                    this.onRemove.invoke(value);
            for(const value of newValue.toArray())
                if (!oldValue.has(value))
                    this.onAppend.invoke(value);
        }
        else if (change instanceof SetChangeTypes.Append) {
            this.onAppend.invoke(deepcopy(change.item));
        }
        else if (change instanceof SetChangeTypes.Remove) {
            this.onRemove.invoke(deepcopy(change.item));
        }
    }
}

export class DictTopic<K,V> extends Topic<Map<K,V>>{
    public changeTypes = {
        'set': DictChangeTypes.Set,
        'add': DictChangeTypes.Add,
        'remove': DictChangeTypes.Remove,
        'change_value': DictChangeTypes.ChangeValue,
    }
    onSet: Action<[Map<K,V>], void>;
    onAdd: Action<[K,V], void>;
    onRemove: Action<[K], void>;
    onChangeValue: Action<[K,V], void>;
    protected value: Map<K,V>;
    constructor(name:string,commandManager:StateManager,initValue?:Map<K,V>){
        super(name,commandManager);
        this.value = new Map<K,V>();
        this.onSet = new Action();
        this.onAdd = new Action();
        this.onRemove = new Action();
        this.onChangeValue = new Action();
    }
    protected _getValue(): Map<K,V> {
        return this.value;
    }
    public set(value: Map<K,V>|any): void{
        if (value instanceof Map) {
            this.applyChangeExternal(new DictChangeTypes.Set<K,V>(this,value));
        }
        else {
            this.applyChangeExternal(new DictChangeTypes.Set<K,V>(this,new Map(Object.entries(value)) as Map<K,V>));
        }
    }
    public add(key: K, value: V): void{
        this.applyChangeExternal(new DictChangeTypes.Add<K,V>(this,key,value));
    }
    public remove(key: K): void{
        this.applyChangeExternal(new DictChangeTypes.Remove<K,V>(this,key));
    }
    public changeValue(key: K, value: V): void{
        this.applyChangeExternal(new DictChangeTypes.ChangeValue<K,V>(this,key,value));
    }
    public get(key: K): V {
        return defined(this.value.get(key));
    }

    protected notifyListenersT(change: Change<Map<K,V>>, oldValue: Map<K,V>, newValue: Map<K,V>): void{
        if (change instanceof DictChangeTypes.Set) {
            const oldKeys = new Set(oldValue.keys());
            const newKeys = new Set(newValue.keys());
            const removedKeys = new Set([...oldKeys].filter(x => !newKeys.has(x)));
            const addedKeys = new Set([...newKeys].filter(x => !oldKeys.has(x)));
            const remainedKeys = new Set([...oldKeys].filter(x => newKeys.has(x)));
            for (const key of removedKeys) {
                this.onRemove.invoke(key);
            }
            for (const key of addedKeys) {
                this.onAdd.invoke(key,newValue.get(key)!);
            }
            for (const key of remainedKeys) {
                if (oldValue.get(key) !== newValue.get(key)) {
                    this.onChangeValue.invoke(key,newValue.get(key)!);
                }
            }
        } else if (change instanceof DictChangeTypes.Add) {
            this.onAdd.invoke(change.key,change.value);
        } else if (change instanceof DictChangeTypes.Remove) {
            this.onRemove.invoke(change.key);
        } else if (change instanceof DictChangeTypes.ChangeValue) {
            this.onChangeValue.invoke(change.key,change.value);
        } else {
            throw new Error(`Unsupported change type ${change} for ${this.constructor.name}`);
        }
    }
}

export class ListTopic<V=any> extends Topic<V[]>{
    public changeTypes = {
        'set': ListChangeTypes.Set,
        'insert': ListChangeTypes.Insert,
        'pop': ListChangeTypes.Pop,
    }
    protected value: V[];
    public onInsert: Action<[V,number], void>;
    public onPop: Action<[V,number], void>;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = [];
        this.onInsert = new Action();
        this.onPop = new Action();
    }

    protected _getValue(): V[] {
        return this.value;
    }

    public set(value: V[]): void{
        this.applyChangeExternal(new ListChangeTypes.Set<V>(this,value));
    }

    public insert(item: V, position:number=-1): void{
        this.applyChangeExternal(new ListChangeTypes.Insert<V>(this,item,position));
    }

    public pop(position:number=-1): V{
        let item = this.value[position];
        this.applyChangeExternal(new ListChangeTypes.Pop<V>(this,position));
        return item;
    }

    public remove(item: V): void{
        const position = this.value.indexOf(item);
        this.applyChangeExternal(new ListChangeTypes.Pop<V>(this,position));
    }

    public get length(): number{
        return this.value.length;
    }

    public getitem(index: number): V{
        return this.value[index];
    }

    public setitem(index: number, value: V): void{
        this.pop(index);
        this.insert(value,index);
    }

    protected notifyListenersT(change: Change<V[]>, oldValue: V[], newValue: V[]): void{
        super.notifyListenersT(change,oldValue,newValue);
        if (change instanceof ListChangeTypes.Set) {
            // pop all and insert all
            for (let i = oldValue.length-1; i >= 0; i--) {
                this.onPop.invoke(oldValue[i],i);
            }
            for (let i = 0; i < newValue.length; i++) {
                this.onInsert.invoke(newValue[i],i);
            }
        } else if (change instanceof ListChangeTypes.Insert) {
            this.onInsert.invoke(change.item,change.position);
        } else if (change instanceof ListChangeTypes.Pop) {
            this.onPop.invoke(change.item,change.position);
        } else {
            throw new Error(`Unsupported change type ${change} for ${this.constructor.name}`);
        }
    }
}

/**
 * A topic that can be used to send events to the server.
 * This topic simulates an event. It contains no state and its value field is always null.
 */
export class EventTopic extends Topic<null>{
    public changeTypes = {
        'emit': EventChangeTypes.Emit,
    }
    protected value: any;
    public onEmit: Action<[any], void>;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = null;
        this.onEmit = new Action();
    }

    protected _getValue(): any {
        return this.value;
    }

    public set(value: any): void{
        throw new Error('You cannot set the value of an event topic.');
    }

    public emit(args:any): void{
        this.applyChangeExternal(new EventChangeTypes.Emit(this,args));
    }
}