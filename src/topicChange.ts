import { v4 as uuidv4 } from "uuid";
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

interface ChangeTypeCollection {
  types: {
    [key: string]: typeof Change;
  };
}

export namespace StringChangeTypes  {
  export const Set = SetChange<string>;
}

export const TypeNameToChangeTypes: {
  [key: string]: any;
} = {
  string: StringChangeTypes
}