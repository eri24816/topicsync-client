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

  constructor(id?: string) {
    if (id) {
      this.id = id;
    } else {
      this.id = uuidv4();
    }
  }

  abstract apply(oldValue: T): T;

  abstract serialize(): ChangeDict;

  abstract inverse(): Change<T>;

  public static deserialize(
    changeType: SubclassOfChange<any>,
    changeDict: ChangeDict
  ): Change<any> {
    const { type, ...rest } = changeDict;
    switch (changeType) {
      case StringChangeTypes.Set:
        return new StringChangeTypes.Set(rest.value, rest.old_value, rest.id);
      case SetChangeTypes.Set:
        return new SetChangeTypes.Set(rest.value, rest.old_value, rest.id);
      case SetChangeTypes.Append:
        return new SetChangeTypes.Append(rest.item, rest.id);
      case SetChangeTypes.Remove:
        return new SetChangeTypes.Remove(rest.item, rest.id);
      default:
        throw new Error(`Unknown change type: ${type}`);
    }
  }
}

import deepcopy from "deepcopy";

interface SetChangeDict extends ChangeDict {
  type: "set";
  value: any;
  old_value: any;
}

class SetChange<T> extends Change<T> {
  value: T;
  old_value?: T; 

  constructor(value: T, old_value?: T, id?: string) {
    super(id);
    this.value = value;
    this.old_value = old_value;
  }

  apply(oldValue: T): T {
    this.old_value = deepcopy(oldValue);
    return deepcopy(this.value);
  }

  serialize(): SetChangeDict {
    return {
      type: "set",
      value: deepcopy(this.value),
      old_value: deepcopy(this.old_value),
      id: this.id,
    };
  }

  inverse(): Change<T> {
    if (this.old_value === undefined) {
      throw new InvalidChangeException(
        "Cannot inverse the change before it is applied."
      );
    }
    return new SetChange<T>(deepcopy(this.old_value), deepcopy(this.value));
  }
}

export namespace StringChangeTypes  {
  export const Set = SetChange<string>;
}

export namespace SetChangeTypes  {
  export class Set extends Change<ValueSet> {
    value: ValueSet;
    old_value?: ValueSet;
    constructor(value: any[], old_value?: any[], id?: string) {
      super(id);
      this.value = new ValueSet(value);
      this.old_value = old_value ? new ValueSet(old_value) : undefined;
    }
    apply(oldValue: ValueSet): ValueSet {
      this.old_value = oldValue.copy();
      return this.value.copy();
    }
    serialize(): ChangeDict {
      return {
        type: "set",
        value: this.value.toArray(),
        old_value: this.old_value?.toArray(),
        id: this.id,
      };
    }
    inverse(): Change<ValueSet> {
      if (this.old_value === undefined) {
        throw new InvalidChangeException("Cannot inverse the change before it is applied.");
      }
      return new Set(this.old_value.toArray(), this.value.toArray()); 
    }
  }


  export class Append extends Change<ValueSet> {
    item: any;
    constructor(item: any, id?: string) {
      super(id);
      this.item = item;
    }
    apply(oldValue: ValueSet): ValueSet {
      const newValue = oldValue.copy();
      if (!newValue.add(this.item))
        throw new InvalidChangeException(`Item ${this.item} already exists in set.`)
      return newValue;
    }
    serialize(): ChangeDict {
      return {
        type: "append",
        item: this.item,
        id: this.id,
      };
    }
    inverse(): Change<ValueSet> {
      return new Remove(this.item);
    }
  }
  export class Remove extends Change<ValueSet> {
    item: any;
    constructor(item: any, id?: string) {
      super(id);
      this.item = item;
    }
    apply(oldValue: ValueSet): ValueSet {
      const newValue = oldValue.copy();
      if (!newValue.delete(this.item))
        throw new InvalidChangeException(`Item ${this.item} not found in set.`);
      return newValue;
    }
    serialize(): ChangeDict {
      return {
        type: "remove",
        item: this.item,
        id: this.id,
      };
    }
    inverse(): Change<ValueSet> {
      return new Append(this.item);
    }
  }
}
