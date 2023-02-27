import { Action, camel_to_snake, equalValue } from './utils';
import { Change, InvalidChangeException, StringChangeTypes, SetChangeTypes as SetChangeTypes, SubclassOfChange } from './topicChange';
import {CommandManager, ChangeCommand} from './command';
import deepcopy from 'deepcopy';
import { ValueSet } from './collection';

type Validator<T> = (oldValue: T, newValue: T, change: Change<T>) => boolean;

interface ChangeDict {
  type: string;
  [key: string]: any;
}


export abstract class Topic<T>{
    static GetTypeFromName(name: string): { new(name: string, commandManager: CommandManager): Topic<any>; }{
        switch (name) {
            case 'string':
                return StringTopic;
            case 'set':
                return SetTopic;
            default:
                throw new Error(`Unknown topic type: ${name}`);
        }
    }
    protected name: string;
    protected abstract value: T;
    private commandManager: CommandManager;
    private validators: Validator<T>[];
    private noPreviewChangeTypes: Set<SubclassOfChange<T>>;
    public abstract readonly changeTypes: {[key:string]:SubclassOfChange<T> }
    constructor(name:string,command_manager:CommandManager){
        this.name = name;
        this.commandManager = command_manager;
        this.validators = [];
        this.noPreviewChangeTypes = new Set();
    }
    public getTypeName(): string{
        return camel_to_snake(this.constructor.name.replace('Topic',''));
    }

    public getName(): string{
        return this.name;
    }

    public getValue(): T{
        return this.value;
    }

    public addValidator(validator: Validator<T>): void{
        this.validators.push(validator);
    }

    public disablePreview(change_type?: SubclassOfChange<T>): void{
        if (change_type === undefined) {
            this.noPreviewChangeTypes = new Set(Object.values(this.changeTypes));
        }
        else {
            this.noPreviewChangeTypes.add(change_type);
        }
    }
    public enablePreview(change_type?: SubclassOfChange<T>): void{
        if (change_type === undefined) {
            this.noPreviewChangeTypes.clear();
        }
        else {
            this.noPreviewChangeTypes.delete(change_type);
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
        if (this.commandManager === undefined) {
            this.applyChange(change);
            return;
        }
        this.validateChangeAndGetResult(change);
        let preview = true;
        for (const change_type of this.noPreviewChangeTypes) {
            if (change instanceof change_type) {
                preview = false;
                break;
            }
        }
        this.commandManager.record(true, () => {
            // In the ts implementation, the topic's reference is stored in the command. In the python implementation, 
            // because the topic class is also used by the server, the topic's name is stored in the command to avoid leaving unused references in the history chain.
            this.commandManager.add(new ChangeCommand(this,change,preview));
        })
    }

    public deserializeChange(changeDict: ChangeDict): Change<T> {
        const { type, ...rest } = changeDict;
        const changeType = this.changeTypes[type];
        return Change.deserialize(changeType,changeDict);
    }
}

export class StringTopic extends Topic<string>{
    public changeTypes = {
        'set': StringChangeTypes.Set,
    }
    public onSet: Action<[string], void>;
    protected value: string;
    constructor(name:string,command_manager:CommandManager){
        super(name,command_manager);
        this.value = '';
        this.onSet = new Action();
    }

    public set(value: string): void{
        this.applyChangeExternal(new StringChangeTypes.Set(value));
    }

    protected notifyListeners(change: Change<string>, oldValue: string, newValue: string): void{
        this.onSet.invoke(newValue);
    }
}

export class SetTopic extends Topic<ValueSet>{
    public changeTypes = {
        'set': SetChangeTypes.Set,
        'append': SetChangeTypes.Append,
        'remove': SetChangeTypes.Remove,
    }
    onSet: Action<[any[]], void>;
    onAppend: Action<[any], void>;
    onRemove: Action<[any], void>;
    protected value: ValueSet;
    constructor(name:string,command_manager:CommandManager){
        super(name,command_manager);
        this.value = new ValueSet();
        this.onSet = new Action();
        this.onAppend = new Action();
        this.onRemove = new Action();
    }

    public set(value: any[]): void{
        this.applyChangeExternal(new SetChangeTypes.Set(value));
    }

    public append(value: any): void{
        this.applyChangeExternal(new SetChangeTypes.Append(value));
    }

    public remove(value: any): void{
        this.applyChangeExternal(new SetChangeTypes.Remove(value));
    }

    protected notifyListeners(change: Change<ValueSet>, oldValue: ValueSet, newValue: ValueSet): void{
        if (change instanceof SetChangeTypes.Set) {
            this.onSet.invoke(newValue.toArray());
            for(const value of newValue.substract(oldValue))
                this.onAppend.invoke(value);
            for(const value of oldValue.substract(newValue))
                this.onRemove.invoke(value);
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