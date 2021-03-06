import {
  CipherTextObject,
  SessionCipher,
} from '../../../../../libtextsecure/libsignal-protocol';
import { SignalService } from '../../../../protobuf';
import { StringUtils } from '../../../../session/utils';

export class SessionCipherStub implements SessionCipher {
  public storage: any;
  public address: any;
  constructor(storage: any, address: any) {
    this.storage = storage;
    this.address = address;
  }

  public async encrypt(
    buffer: ArrayBuffer | Uint8Array
  ): Promise<CipherTextObject> {
    return {
      type: SignalService.Envelope.Type.CIPHERTEXT,
      body: StringUtils.decode(buffer, 'binary'),
    };
  }

  public async decryptPreKeyWhisperMessage(
    buffer: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer> {
    throw new Error('Method not implemented.');
  }

  public async decryptWhisperMessage(
    buffer: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer> {
    throw new Error('Method not implemented.');
  }

  public async getRecord(encodedNumber: string): Promise<any> {
    throw new Error('Method not implemented.');
  }

  public async getRemoteRegistrationId(): Promise<number> {
    throw new Error('Method not implemented.');
  }

  public async hasOpenSession(): Promise<boolean> {
    return false;
  }

  public async closeOpenSessionForDevice(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public async deleteAllSessionsForDevice(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
