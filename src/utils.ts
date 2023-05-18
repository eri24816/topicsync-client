export function camelToSnake(str: string): string{
    return str
        .replace(/(?<=[^^])([A-Z])/g, function ($1) { return '_'+$1.toLowerCase(); })
        .replace(/([A-Z])/g, function($1){return $1.toLowerCase();});
}

export function defined<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error("Value is undefined");
    }
    return value as T;
}

export abstract class ContextManager{
    with(callback: () => void): void{
        this.enter();
        try {
            callback();
        }
        finally {
            this.exit();
        }
    }
    abstract enter(): void;
    abstract exit(): void;
}

export class NullContextManager extends ContextManager{
    enter(): void{
    }
    exit(): void{
    }
}

export type Callback<ARGS extends any[] = any[], OUT = any> = (...args: ARGS) => OUT;

export class Action<ARGS extends any[], OUT=void> {
    private _callbacks: Callback<ARGS, OUT>[] = [];

    add(callback: Callback<ARGS, OUT>) {
        this._callbacks.push(callback);
    }
    
    remove(callback: Callback<ARGS, OUT>) {
        const index = this._callbacks.indexOf(callback);
        if (index >= 0) {
            this._callbacks.splice(index, 1);
        }
    }

    invoke(...args: ARGS): OUT[] {
        return this._callbacks.map((callback) => callback(...args));
    }
}

export function equalValue(a: any, b: any) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export type Constructor<T> = new (...args: any[]) => T;

export function json_stringify(obj: any): string{
    return JSON.stringify(obj, function (key, value) {
        if (value instanceof Map) {
            return Object.fromEntries(value.entries()) // or with spread: value: [...value];
        } else {
            return value;
        }
    });
}