export function camel_to_snake(str: string): string{
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

type Callback<ARGS extends any[], OUT> = (...args: ARGS) => OUT;

export class Action<ARGS extends any[], OUT=void> {
    private _callbacks: Callback<ARGS, OUT>[] = [];

    addCallback(callback: Callback<ARGS, OUT>) {
        this._callbacks.push(callback);
    }

    removeCallback(callback: Callback<ARGS, OUT>) {
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