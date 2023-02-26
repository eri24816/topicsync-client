// Not working on Chrome.
export class WeakValueMap<K, V extends object>{
    private finalizationRegistry: FinalizationRegistry<K>;
    map: Map<K, WeakRef<V>>;
    onGarbageCollected: (key: K) => void;
    constructor(onGarbageCollected: (key: K) => void=()=>{}) {
        this.finalizationRegistry = new FinalizationRegistry((key: K) => {
            this.map.delete(key);
            this.onGarbageCollected(key);
        });
        this.map = new Map();
        this.onGarbageCollected = onGarbageCollected;
    }
    set(key: K, value: V) {
        this.map.set(key, new WeakRef(value));
        this.finalizationRegistry.register(value, key);
    }
    get(key: K): V{
        const weakRef = this.map.get(key);
        if (weakRef) {
            const referent = weakRef?.deref();
            if (referent) {
                return referent;
            }
            else {
                this.map.delete(key);
            }
        }
        throw new Error("Key not found");
    }
    has(key: K): boolean {
        return this.map.has(key);
    }
}