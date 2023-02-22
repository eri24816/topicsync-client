"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const finalizableMap_1 = require("./finalizableMap");
const map = new finalizableMap_1.FinalizableMap();
let a = new String("a");
map.onGarbageCollected = (key) => {
    console.log(`Garbage collected ${key}`);
};
map.set("key", a);
a = new String("b");
// const ws: WebSocket = new WebSocket('ws://localhost:8765');
// ws.onopen = () => {
//     ws.send('Hello World!');
// }
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6Ii9zcmMvIiwic291cmNlcyI6WyJhcHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBa0Q7QUFFbEQsTUFBTSxHQUFHLEdBQUcsSUFBSSwrQkFBYyxFQUFFLENBQUM7QUFDakMsSUFBSSxDQUFDLEdBQVcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDaEMsR0FBRyxDQUFDLGtCQUFrQixHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUU7SUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUM1QyxDQUFDLENBQUE7QUFDRCxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNsQixDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFJcEIsOERBQThEO0FBRTlELHNCQUFzQjtBQUN0QiwrQkFBK0I7QUFDL0IsSUFBSSJ9