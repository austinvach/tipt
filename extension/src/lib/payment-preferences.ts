import { PREFER_SPARK_PAYMENTS_KEY } from '../constants';
import { getSynced, setItemDual } from './storage';

export async function getPreferSparkPayments(): Promise<boolean> {
  const stored = await getSynced(PREFER_SPARK_PAYMENTS_KEY);
  return stored === 'true';
}

export async function setPreferSparkPayments(value: boolean): Promise<void> {
  await setItemDual(PREFER_SPARK_PAYMENTS_KEY, value ? 'true' : 'false');
}