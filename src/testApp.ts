import { ChatroomClient } from './index';
import { SetTopic, StringTopic } from './index';
import { expose, print } from './devUtils';
import { TopicsMonitor } from './index';

const chatroom = new ChatroomClient('ws://localhost:8765');
chatroom.onConnected(() => {
    chatroom.makeRequest('add', {a:1,b:2}, (response: any) => {
        print('1+2=',response);
    });
    chatroom.makeRequest('greet', {name:'Eric'}, (response: any) => {
        print(response);
    });

    const a = chatroom.getTopic<StringTopic>('a');
    const topicSet = chatroom.getTopic<SetTopic>('_chatroom/topics');
    topicSet.onAppend.add((topic) => {
        print('topic added:', topic);
    });
    topicSet.onRemove.add((topic) => {
        print('topic removed:', topic);
    });
    expose('chatroom', chatroom);
    expose('c', chatroom);
    expose('a', a);

    const monitor = new TopicsMonitor(document.body, chatroom);
});
