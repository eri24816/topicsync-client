"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinalizableMap = void 0;
class FinalizableMap extends WeakMap {
    constructor() {
        super();
        this.finalizationRegistry = new FinalizationRegistry((key) => {
            this.onGarbageCollected(key);
        });
    }
    set(key, value) {
        super.set(key, value);
        this.finalizationRegistry.register(value, key);
        return this;
    }
    onGarbageCollected(key) {
        console.log(`Garbage collected ${key}`);
    }
}
exports.FinalizableMap = FinalizableMap;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluYWxpemFibGVNYXAuanMiLCJzb3VyY2VSb290IjoiL3NyYy8iLCJzb3VyY2VzIjpbImZpbmFsaXphYmxlTWFwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLE1BQWEsY0FBZSxTQUFRLE9BQU87SUFFdkM7UUFDSSxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLG9CQUFvQixDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUU7WUFDakUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUNELEdBQUcsQ0FBQyxHQUFXLEVBQUUsS0FBVTtRQUN2QixLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QixJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMvQyxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBQ0Qsa0JBQWtCLENBQUMsR0FBVztRQUMxQixPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDSjtBQWhCRCx3Q0FnQkMifQ==