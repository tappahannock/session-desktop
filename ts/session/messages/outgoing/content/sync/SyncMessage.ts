import { ContentMessage } from '../ContentMessage';
import { SignalService } from '../../../../../protobuf';
import * as crypto from 'crypto';
import { Constants } from '../../../..';

export abstract class SyncMessage extends ContentMessage {
  public ttl(): number {
    return Constants.TTL_DEFAULT.REGULAR_MESSAGE;
  }

  protected contentProto(): SignalService.Content {
    return new SignalService.Content({
      syncMessage: this.syncProto(),
    });
  }

  protected syncProto(): SignalService.SyncMessage {
    const syncMessage = new SignalService.SyncMessage();

    // Generate a random int from 1 and 512
    const buffer = crypto.randomBytes(1);

    // tslint:disable-next-line: no-bitwise
    const paddingLength = (new Uint8Array(buffer)[0] & 0x1ff) + 1;

    // Generate a random padding buffer of the chosen size
    syncMessage.padding = crypto.randomBytes(paddingLength);

    return syncMessage;
  }
}
