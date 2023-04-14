import { ChatroomClient } from './client';
import { StringTopic } from './topic';
import { expose, print } from './dev_utils';
import { TopicsMonitor } from './topicsMonitor';

const client = new ChatroomClient('ws://localhost:8765');
client.onConnected(() => {

    // client.makeRequest('add', {a:1,b:2}, (response: any) => {
    //     print('1+2=',response);
    // });
    // client.makeRequest('greet', {name:'Eric'}, (response: any) => {
    //     print(response);
    // });

    const a = client.getTopic<StringTopic>('a');
    a.onSet.addCallback((change) => {
        print('a changed:', change);
    });
    expose('client', client);
    expose('a', a);

    const monitor = new TopicsMonitor(document.body, client);
});
