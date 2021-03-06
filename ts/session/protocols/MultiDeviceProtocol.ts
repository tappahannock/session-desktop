import _ from 'lodash';
import {
  createOrUpdatePairingAuthorisation,
  getPairingAuthorisationsFor,
  PairingAuthorisation,
  removePairingAuthorisationsFor,
} from '../../../js/modules/data';
import { PrimaryPubKey, PubKey, SecondaryPubKey } from '../types';
import { UserUtil } from '../../util';
import { StringUtils } from '../utils';

/*
  The reason we're exporing a class here instead of just exporting the functions directly is for the sake of testing.
  We might want to stub out specific functions inside the multi device protocol itself but when exporting functions directly then it's not possible without weird hacks.
*/
// tslint:disable-next-line: no-unnecessary-class
export class MultiDeviceProtocol {
  public static refreshDelay: number = 5 * 60 * 1000; // 5 minutes
  private static lastFetch: { [device: string]: number } = {};

  /**
   * Fetch pairing authorisations from the file server if needed and store it in the database.
   *
   * This will fetch authorisations if:
   *  - It is not one of our device
   *  - The time since last fetch is more than refresh delay
   */
  public static async fetchPairingAuthorisationsIfNeeded(
    device: PubKey
  ): Promise<void> {
    // Disable fetching if we don't want to use multi device
    if (!window.lokiFeatureFlags.useMultiDevice) {
      return;
    }

    // This return here stops an infinite loop when we get all our other devices
    const ourKey = await UserUtil.getCurrentDevicePubKey();
    if (!ourKey || device.key === ourKey) {
      return;
    }

    // We always prefer our local pairing over the one on the server
    const isOurDevice = await this.isOurDevice(device);
    if (isOurDevice) {
      return;
    }

    // Only fetch if we hit the refresh delay
    const lastFetchTime = this.lastFetch[device.key];
    if (lastFetchTime && lastFetchTime + this.refreshDelay > Date.now()) {
      return;
    }

    this.lastFetch[device.key] = Date.now();

    try {
      const authorisations = await this.fetchPairingAuthorisations(device);
      await Promise.all(authorisations.map(this.savePairingAuthorisation));
    } catch (e) {
      // Something went wrong, let it re-try another time
      this.lastFetch[device.key] = lastFetchTime;
    }
  }

  /**
   * Reset the pairing fetched cache.
   *
   * This will make it so the next call to `fetchPairingAuthorisationsIfNeeded` will fetch mappings from the server.
   */
  public static resetFetchCache() {
    this.lastFetch = {};
  }

  /**
   * Fetch pairing authorisations for the given device from the file server.
   * This function will not save the authorisations to the database.
   *
   * @param device The device to fetch the authorisation for.
   */
  public static async fetchPairingAuthorisations(
    device: PubKey
  ): Promise<Array<PairingAuthorisation>> {
    if (!window.lokiFileServerAPI) {
      throw new Error('lokiFileServerAPI is not initialised.');
    }

    const mapping = await window.lokiFileServerAPI.getUserDeviceMapping(
      device.key
    );

    if (!mapping || !mapping.authorisations) {
      return [];
    }

    try {
      const authorisations = mapping.authorisations.map(
        ({
          primaryDevicePubKey,
          secondaryDevicePubKey,
          requestSignature,
          grantSignature,
        }) => ({
          primaryDevicePubKey,
          secondaryDevicePubKey,
          requestSignature: StringUtils.encode(requestSignature, 'base64'),
          grantSignature: grantSignature
            ? StringUtils.encode(grantSignature, 'base64')
            : undefined,
        })
      );

      const validAuthorisations = await Promise.all(
        authorisations.map(async authorisation => {
          const valid = await window.libloki.crypto.verifyAuthorisation(
            authorisation
          );
          return valid ? authorisation : undefined;
        })
      );

      return validAuthorisations.filter(a => !!a) as Array<
        PairingAuthorisation
      >;
    } catch (e) {
      console.warn(
        `MultiDeviceProtocol::fetchPairingAuthorisation: Failed to map authorisations for ${device.key}.`,
        e
      );
      return [];
    }
  }

  /**
   * Save pairing authorisation to the database.
   * @param authorisation The pairing authorisation.
   */
  public static async savePairingAuthorisation(
    authorisation: PairingAuthorisation
  ): Promise<void> {
    return createOrUpdatePairingAuthorisation(authorisation);
  }

  /**
   * Get pairing authorisations for a given device.
   * @param device The device to get pairing authorisations for.
   */
  public static async getPairingAuthorisations(
    device: PubKey | string
  ): Promise<Array<PairingAuthorisation>> {
    const pubKey = PubKey.cast(device);
    await this.fetchPairingAuthorisationsIfNeeded(pubKey);

    return getPairingAuthorisationsFor(pubKey.key);
  }

  /**
   * Remove all pairing authorisations for a given device.
   * @param device The device to remove authorisation for.
   */
  public static async removePairingAuthorisations(
    device: PubKey | string
  ): Promise<void> {
    const pubKey = PubKey.cast(device);

    return removePairingAuthorisationsFor(pubKey.key);
  }

  /**
   * Get all devices linked to a user.
   *
   * @param user The user to get all the devices from.
   */
  public static async getAllDevices(
    user: PubKey | string
  ): Promise<Array<PubKey>> {
    const pubKey = PubKey.cast(user);
    const authorisations = await this.getPairingAuthorisations(pubKey);
    if (authorisations.length === 0) {
      return [pubKey];
    }
    const devices = _.flatMap(
      authorisations,
      ({ primaryDevicePubKey, secondaryDevicePubKey }) => [
        primaryDevicePubKey,
        secondaryDevicePubKey,
      ]
    );

    return _.uniq(devices).map(p => new PubKey(p));
  }

  /**
   * Get the primary device linked to a user.
   *
   * @param user The user to get primary device for.
   */
  public static async getPrimaryDevice(
    user: PubKey | string
  ): Promise<PrimaryPubKey> {
    const pubKey = PubKey.cast(user);
    const authorisations = await this.getPairingAuthorisations(pubKey);
    if (authorisations.length === 0) {
      return pubKey;
    }

    const primary = PrimaryPubKey.from(authorisations[0].primaryDevicePubKey);
    if (!primary) {
      throw new Error(`Primary user public key is invalid for ${pubKey.key}.`);
    }

    return primary;
  }

  /**
   * Get all the secondary devices linked to a user.
   *
   * @param user The user to get the devices from.
   */
  public static async getSecondaryDevices(
    user: PubKey | string
  ): Promise<Array<SecondaryPubKey>> {
    const primary = await this.getPrimaryDevice(user);
    const authorisations = await this.getPairingAuthorisations(primary);

    return authorisations
      .map(a => a.secondaryDevicePubKey)
      .map(pubKey => new SecondaryPubKey(pubKey));
  }

  /**
   * Get all devices linked to the current user.
   */
  public static async getOurDevices(): Promise<Array<PubKey>> {
    const ourPubKey = await UserUtil.getCurrentDevicePubKey();
    if (!ourPubKey) {
      throw new Error('Public key not set.');
    }

    return this.getAllDevices(ourPubKey);
  }

  /**
   * Check if the given device is one of our own.
   * @param device The device to check.
   */
  public static async isOurDevice(device: PubKey | string): Promise<boolean> {
    const pubKey = PubKey.cast(device);
    try {
      const ourDevices = await this.getOurDevices();

      return ourDevices.some(d => d.isEqual(pubKey));
    } catch (e) {
      return false;
    }
  }
}
