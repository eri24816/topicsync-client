import { v4 as uuidv4 } from "uuid";
import { ValueSet } from "./collection";
export type SubclassOfChange<T> = new (...args: any[]) => Change<T>

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
  topic: Topic<T>;
  constructor(topic: Topic<T>,id?: string) {
    this.topic = topic;
    if (id) {
      this.id = id;
    } else {
      this.id = uuidv4();
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
    changeType: SubclassOfChange<any>,
    changeDict: ChangeDict
  ): Change<any> {
    const { type, ...rest } = changeDict;
    switch (changeType) {
      case StringChangeTypes.Set:
        return new StringChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
      case SetChangeTypes.Set:
        return new SetChangeTypes.Set(topic,rest.value, rest.old_value, rest.id);
      case SetChangeTypes.Append:
        return new SetChangeTypes.Append(topic,rest.item, rest.id);
      case SetChangeTypes.Remove:
        return new SetChangeTypes.Remove(topic,rest.item, rest.id);
      default:
        throw new Error(`Unknown change type: ${type}`);
    }
  }
}

import deepcopy from "deepcopy";
import { Topic } from "./topic";

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

export namespace StringChangeTypes  {
  export const Set = SetChange<string>;
}

export namespace SetChangeTypes  {
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
      const newValue = oldValue.copy();
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
      const newValue = oldValue.copy();
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
