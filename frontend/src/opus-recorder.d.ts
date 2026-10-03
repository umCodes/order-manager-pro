declare module "opus-recorder" {
  type RecorderConfig = {
    encoderPath?: string;
    encoderApplication?: number;
    encoderSampleRate?: number;
    numberOfChannels?: number;
    streamPages?: boolean;
    mediaTrackConstraints?: boolean | MediaTrackConstraints;
  };

  export default class Recorder {
    constructor(config?: RecorderConfig);
    static isRecordingSupported(): boolean;
    ondataavailable: (data: Uint8Array) => void;
    onstop: () => void;
    start(): Promise<void>;
    stop(): Promise<void>;
    close(): void;
    encodedSamplePosition: number;
  }
}
