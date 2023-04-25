import { Action, camelToSnake, equalValue } from './utils';
import { Change, InvalidChangeException, StringChangeTypes, SetChangeTypes as SetChangeTypes, ConstructorOfChange, IntChangeTypes, FloatChangeTypes, GenericChangeTypes } from './change';
import {StateManager} from './stateManager';
import deepcopy from 'deepcopy';
import { ValueSet } from './collection';

type Validator<T> = (oldValue: T, newValue: T, change: Change<T>) => boolean;

interface ChangeDict {
  type: string;
  [key: string]: any;
}

let defaultValues: { [key: string]: any } = {
    string: '',
    set: [],
};

export abstract class Topic<T,TI=T>{
    static getTypeDict(): {[key:string]:{ new(name: string, commandManager: StateManager): Topic<any>; }}
    {
        return {
            generic: GenericTopic,
            string: StringTopic,
            int: IntTopic,
            float: FloatTopic,
            set: SetTopic,
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
    public abstract onSet: Action<[TI],void>;
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

    public setToDefault(): void{
        this.set(defaultValues[this.getTypeName()] as TI);
    }
    
    protected abstract notifyListeners(change: Change<T>, oldValue: T, newValue: T): void;

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
        const oldValue = this.value;
        const newValue = this.validateChangeAndGetResult(change);
        this.value = newValue;
        this.notifyListeners(change, oldValue, newValue);
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
    public onSet: Action<[T], void>;
    protected value!: T
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.onSet = new Action();
    }

    protected _getValue(): T {
        return this.value;
    }

    public set(value: T): void{
        this.applyChangeExternal(new GenericChangeTypes.Set(this,value));
    }

    protected notifyListeners(change: Change<T>, oldValue: T, newValue: T): void{
        this.onSet.invoke(newValue);
    }
}

export class StringTopic extends Topic<string>{
    public changeTypes = {
        'set': StringChangeTypes.Set,
    }
    public onSet: Action<[string], void>;
    protected value: string;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = '';
        this.onSet = new Action();
    }

    protected _getValue(): string {
        return this.value;
    }

    public set(value: string): void{
        this.applyChangeExternal(new StringChangeTypes.Set(this,value));
    }

    protected notifyListeners(change: Change<string>, oldValue: string, newValue: string): void{
        this.onSet.invoke(newValue);
    }
}

export class IntTopic extends Topic<number>{
    public changeTypes = {
        'set': IntChangeTypes.Set,
        'add': IntChangeTypes.Add
    }
    public onSet: Action<[number], void>;
    protected value: number;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = 0;
        this.onSet = new Action();
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

    protected notifyListeners(change: Change<number>, oldValue: number, newValue: number): void{
        this.onSet.invoke(newValue);
    }
}

export class FloatTopic extends Topic<number>{
    public changeTypes = {
        'set': FloatChangeTypes.Set,
        'add': FloatChangeTypes.Add
    }
    public onSet: Action<[number], void>;
    protected value: number;
    constructor(name:string,commandManager:StateManager){
        super(name,commandManager);
        this.value = 0;
        this.onSet = new Action();
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

    protected notifyListeners(change: Change<number>, oldValue: number, newValue: number): void{
        this.onSet.invoke(newValue);
    }
}

export class SetTopic extends Topic<ValueSet,any[]>{
    public changeTypes = {
        'set': SetChangeTypes.Set,
        'append': SetChangeTypes.Append,
        'remove': SetChangeTypes.Remove,
    }
    onSet: Action<[any[]], void>;
    onAppend: Action<[any], void>;
    onRemove: Action<[any], void>;
    protected value: ValueSet;
    constructor(name:string,commandManager:StateManager,initValue?:any[]){
        super(name,commandManager);
        this.value = new ValueSet();
        this.onSet = new Action();
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

    protected notifyListeners(change: Change<ValueSet>, oldValue: ValueSet, newValue: ValueSet): void{
        if (change instanceof SetChangeTypes.Set) {
            this.onSet.invoke(newValue.toArray());
            for(const value of oldValue.toArray())
                if (!newValue.has(value))
                    this.onRemove.invoke(value);
            for(const value of newValue.toArray())
                if (!oldValue.has(value))
                    this.onAppend.invoke(value);
        }
        else if (change instanceof SetChangeTypes.Append) {
            this.onSet.invoke(newValue.toArray());
            this.onAppend.invoke(deepcopy(change.item));
        }
        else if (change instanceof SetChangeTypes.Remove) {
            this.onSet.invoke(newValue.toArray());
            this.onRemove.invoke(deepcopy(change.item));
        }
    }

}