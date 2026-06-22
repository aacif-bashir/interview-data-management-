/**
 * Error type that data-access functions throw to signal an HTTP-mappable
 * condition. Route handlers catch this and map `.status` to the response code.
 */
export class DataError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DataError";
    this.status = status;
  }
}

export const notFound = (what = "Resource") =>
  new DataError(`${what} not found`, 404);

export const conflict = (message: string) => new DataError(message, 409);
