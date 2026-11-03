// assertThrows and assertRejects as @std/assert had them: the error a function throws or a promise
// rejects with, of the given class and with the text in its message
import { expect } from "bun:test";

type ErrorClass<E extends Error> = abstract new (...args: never[]) => E;

const check = <E extends Error>(error: unknown, ErrorClass?: ErrorClass<E>, includes?: string): E => {
  if (ErrorClass) expect(error).toBeInstanceOf(ErrorClass);
  if (includes !== undefined) expect((error as Error).message).toContain(includes);
  return error as E;
};

export const assertThrows = <E extends Error = Error>(fn: () => unknown, ErrorClass?: ErrorClass<E>, includes?: string): E => {
  try {
    fn();
  } catch (error) {
    return check(error, ErrorClass, includes);
  }
  throw new Error("Expected the function to throw");
};

export const assertRejects = async <E extends Error = Error>(
  fn: () => PromiseLike<unknown>,
  ErrorClass?: ErrorClass<E>,
  includes?: string,
): Promise<E> => {
  try {
    await fn();
  } catch (error) {
    return check(error, ErrorClass, includes);
  }
  throw new Error("Expected the promise to reject");
};
