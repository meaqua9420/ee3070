declare module 'mp3-duration' {
  function mp3Duration(
    input: Buffer | string,
    callback?: (error: Error | null, duration: number) => void,
  ): Promise<number>

  export default mp3Duration
}
