export class ValueSet{
    private values: Set<string>;
    constructor(values: string[] = []){
        this.values = new Set(values.map(v=>JSON.stringify(v)));
    }
    public has(value: any): boolean{
        return this.values.has(JSON.stringify(value));
    }
    public add(value: any): boolean{
        if (this.has(value)) {
            return false;
        }
        this.values.add(JSON.stringify(value));
        return true;
    }
    public delete(value: any): boolean{
        if (!this.has(value)) {
            return false;
        }
        this.values.delete(JSON.stringify(value));
        return true;
    }
    public toArray(): any[]{
        return Array.from(this.values).map(v=>JSON.parse(v));
    }
    public toSet(): Set<any>{
        return new Set(this.toArray());
    }
    public setValues(values: any[]): void{
        this.values = new Set(values.map(v => JSON.stringify(v)));
    }
    public substract(other: ValueSet): ValueSet{
        const diff = new ValueSet([]);
        for (const value of this.values) {
            if (!other.values.has(value)) {
                diff.values.add(value);
            }
        }
        return diff;
    }
    public copy(): ValueSet{
        return new ValueSet(this.toArray());
    }
    *[Symbol.iterator]() {
        for (const value of this.values) {
            yield JSON.parse(value);
        }
    }
}