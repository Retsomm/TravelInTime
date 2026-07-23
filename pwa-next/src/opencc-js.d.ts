declare module 'opencc-js' {
  type ConverterFn = (text: string) => string
  interface ConverterOptions {
    from: 'cn' | 'tw' | 'twp' | 'hk' | 't' | 'jp'
    to: 'cn' | 'tw' | 'twp' | 'hk' | 't' | 'jp'
  }
  export const Converter: (opts: ConverterOptions) => ConverterFn
  export const CustomConverter: (dict: [string, string][]) => ConverterFn
}
