export class FinalizableMap extends WeakMap{
    private readonly finalizationRegistry: FinalizationRegistry<String>;
    constructor(){
        super();
        this.finalizationRegistry = new FinalizationRegistry((key: String) => {
            this.onGarbageCollected(key);
        });
    }
    set(key: String, value: any){
        super.set(key, value);
        this.finalizationRegistry.register(value, key);
        return this;
    }
    onGarbageCollected(key: String){
        console.log(`Garbage collected ${key}`);
    }
}