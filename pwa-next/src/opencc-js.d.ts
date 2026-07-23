declare module 'opencc-js' {
  type ConverterFn = (text: string) => string
  interface ConverterOptions {
    from: 'cn' | 'tw' | 'twp' | 'hk' | 't' | 'jp'
    to: 'cn' | 'tw' | 'twp' | 'hk' | 't' | 'jp'
  }
  export function Converter(opts: ConverterOptions): ConverterFn
  export function CustomConverter(dict: [string, string][]): ConverterFn
}
