import { FinalizableMap } from "./finalizableMap";
console.log("Hello World!");
const map = new FinalizableMap();
let a: object = new String("a");
map.onGarbageCollected = (key: String) => {
    console.log(`Garbage collected ${key}`);
}
map.set("key", a); 
a = new String("bagergeraagergera");



// const ws: WebSocket = new WebSocket('ws://localhost:8765');

// ws.onopen = () => {
//     ws.send('Hello World!');
// }
