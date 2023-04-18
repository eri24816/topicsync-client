import { Action, camelToSnake, equalValue } from './utils';
import { Change, InvalidChangeException, StringChangeTypes, SetChangeTypes as SetChangeTypes, SubclassOfChange } from './change';
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
        return {string: StringTopic, set: SetTopic}
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
    private noPreviewChangeTypes: Set<SubclassOfChange<T>>;
    public abstract readonly changeTypes: { [key: string]: SubclassOfChange<T> }
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

    public disablePreview(changeType?: SubclassOfChange<T>): void{
        if (changeType === undefined) {
            this.noPreviewChangeTypes = new Set(Object.values(this.changeTypes));
        }
        else {
            this.noPreviewChangeTypes.add(changeType);
        }
    }

    public enablePreview(changeType?: SubclassOfChange<T>): void{
        if (changeType === undefined) {
            this.noPreviewChangeTypes.clear();
        }
        else {
            this.noPreviewChangeTypes.delete(changeType);
        }
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
        this.detached = true;
    }

    private checkDetached(): void{
        if (this.detached) {
            throw new Error(`The topic ${this.name} has been removed. You cannot use it anymore.`);
        }
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
            // for(const value of newValue.substract(oldValue))
            //     this.onRemove.invoke(value);
            // for(const value of oldValue.substract(newValue))
            //     this.onAppend.invoke(value);
            //optimize:
            console.log('oldValue',oldValue.toArray());
            console.log('newValue',newValue.toArray());
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