import { Action, camelToSnake, equalValue } from './utils';
import { Change, InvalidChangeException, StringChangeTypes, SetChangeTypes as SetChangeTypes, ConstructorOfChange, IntChangeTypes, FloatChangeTypes, GenericChangeTypes, EventChangeTypes } from './change';
import {StateManager} from './stateManager';
import deepcopy from 'deepcopy';
import { ValueSet } from './collection';

type Validator<T> = (oldValue: T, newValue: T, change: Change<T>) => boolean;

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

    private validateChangeAndGetResult(change: Change<T>): T{
        const oldValue = this.value;
        const newValue = change.apply(oldValue);
        for (const validator of this.validators) {
            if (!validator(oldValue, newValue, change)) {
                throw new InvalidChangeException(`Change ${change.serialize()} is not valid for topic ${this.name}. Old value: ${oldValue}, invalid new value: ${newValue}`);
            }
        }
        if ((newValue as any)['value'] !== undefined) {
            throw new Error('Invalid change: new value has a "value" property');
        }
        return newValue;
    }

    public applyChange(change: Change<T>): void{
        const oldValueTI = this.getValue();
        const oldValueT = this.value;
        this.value = this.validateChangeAndGetResult(change);
        const newValueTI = this.getValue();
        const newValueT = this.value;
        this.notifyListenersT(change, oldValueT, newValueT);
        this.notifyListeners(change, oldValueTI, newValueTI);
    }

    public applyChangeExternal(change: Change<T>): void{
        this.checkDetached();
        this.validateChangeAndGetResult(change);
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
        if (initValue !== undefined) // for _chatroom/topics
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

/**
 * A topic that can be used to send events to the server.
 * This topic simulates an event. It contains no state and its value field is always null.
 */
export class EventTopic extends Topic<null>{
    public changeTypes = {
        'emit': EventChangeTypes.Emit,
    }
    protected value: any;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = null;
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