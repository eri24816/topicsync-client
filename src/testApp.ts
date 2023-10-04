import { TopicsyncClient } from './index';
import { SetTopic, StringTopic } from './index';
import { expose, print } from './devUtils';
import { TopicsMonitor } from './index';

const topicsync = new TopicsyncClient('ws://localhost:8765');
// topicsync.onConnected(() => {
//     topicsync.makeRequest('add', {a:1,b:2}, (response: any) => {
//         print('1+2=',response);
//     });
//     topicsync.makeRequest('greet', {name:'Eric'}, (response: any) => {
//         print(response);
//     });

//     const a = topicsync.getTopic('a',StringTopic);
//     const topicSet = topicsync.getTopic('_topicsync/topics',SetTopic);
//     topicSet.onAppend.add((topic) => {
//         print('topic added:', topic);
//     });
//     topicSet.onRemove.add((topic) => {
//         print('topic removed:', topic);
//     });
//     expose('topicsync', topicsync);
//     expose('c', topicsync);
//     expose('a', a);

//     const monitor = new TopicsMonitor(document.body, topicsync);
// });
new TopicsMonitor(document.body, topicsync);
expose('topicsync', topicsync);
expose('c', topicsync);