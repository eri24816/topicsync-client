import { Topic } from "./topic";
import { Change } from "./topicChange";
import { ContextManager, NullContextManager } from "./utils";

export abstract class Command {
  preview: boolean;

  constructor(preview: boolean = false) {
    this.preview = preview;
  }

  abstract execute(): void;

  abstract undo(): void;

  abstract redo(): void;
}

export class ChangeCommand<T> extends Command {
  topic: Topic<T>;
  change: Change<T>;

  constructor(topic: Topic<T,any>, change: Change<T>, preview: boolean = false) {
    super(preview);
    this.topic = topic;
    this.change = change;
  }

  execute(): void {
    this.topic.applyChange(this.change);
  }

  undo(): void {
    this.topic.applyChange(this.change.inverse());
  }

  redo(): void {
    this.topic.applyChange(this.change);
  }

  serialize(): {[key: string]: any} {
    return {
      topic_name: this.topic.getName(),
      change: this.change.serialize(),
    };
  }
}

export class CommandManager{
  static RecordContext = class extends ContextManager {
    commandManager: CommandManager;
    constructor(commandmanager: CommandManager){
      super();
      this.commandManager = commandmanager;
    }
    enter(): void{
      this.commandManager.startRecording();
    }
    exit(): void{
      this.commandManager.stopRecording();
    }
  }

  private recordedCommands: Command[];
  private isRecording: boolean;
  private onRecordingStop: ((recorded_commands: Command[]) => void) | undefined;
  private onAdd: ((added_command: Command) => void);
  constructor(onRecordingStop?: (recorded_commands:Command[]) => void, onAdd: (added_command: Command) => void = (added_command)=>added_command.execute()) {
    this.recordedCommands = [];
    this.isRecording = false;
    this.onRecordingStop = onRecordingStop;
    this.onAdd = onAdd;
  }

  startRecording(): void{
    this.isRecording = true;
  }

  stopRecording(): void{
    this.isRecording = false;
    if (this.onRecordingStop !== undefined) {
      this.onRecordingStop(this.recordedCommands);
    }
  }
  
  record(allow_already_recording = false, callback = () => {}): void{
    if (this.isRecording){
      if (allow_already_recording) {
        callback();
      }
      else {
        throw new Error("Already recording");
      }
    }
    else {
      const context = new CommandManager.RecordContext(this);
      context.with(callback);
    }
  }
  
  add(command: Command): void{
    this.onAdd(command);
    if (this.isRecording) {
      this.recordedCommands.push(command);
    }
  }

  reset(): void{
    for(let i = this.recordedCommands.length-1; i >= 0; i--){
      this.recordedCommands[i].undo();
    }
    this.recordedCommands = [];
  }

  commit(): Command[]{
    const temp = this.recordedCommands;
    this.recordedCommands = [];
    return temp;
  }
}