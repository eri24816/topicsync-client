/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/finalizableMap.ts":
/*!*******************************!*\
  !*** ./src/finalizableMap.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\r\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\r\nexports.FinalizableMap = void 0;\r\nclass FinalizableMap extends WeakMap {\r\n    constructor() {\r\n        super();\r\n        this.finalizationRegistry = new FinalizationRegistry((key) => {\r\n            this.onGarbageCollected(key);\r\n        });\r\n    }\r\n    set(key, value) {\r\n        super.set(key, value);\r\n        this.finalizationRegistry.register(value, key);\r\n        return this;\r\n    }\r\n    onGarbageCollected(key) {\r\n        console.log(`Garbage collected ${key}`);\r\n    }\r\n}\r\nexports.FinalizableMap = FinalizableMap;\r\n\n\n//# sourceURL=webpack://ChatRoomClient_TS/./src/finalizableMap.ts?");

/***/ }),

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\r\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\r\nconst finalizableMap_1 = __webpack_require__(/*! ./finalizableMap */ \"./src/finalizableMap.ts\");\r\nconst map = new finalizableMap_1.FinalizableMap();\r\nlet a = new String(\"a\");\r\nmap.onGarbageCollected = (key) => {\r\n    console.log(`Garbage collected ${key}`);\r\n};\r\nmap.set(\"key\", a);\r\na = new String(\"bagergeraagergera\");\r\n// const ws: WebSocket = new WebSocket('ws://localhost:8765');\r\n// ws.onopen = () => {\r\n//     ws.send('Hello World!');\r\n// }\r\n\n\n//# sourceURL=webpack://ChatRoomClient_TS/./src/index.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/index.ts");
/******/ 	
/******/ })()
;