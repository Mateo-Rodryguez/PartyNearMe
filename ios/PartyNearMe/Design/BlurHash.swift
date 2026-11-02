import UIKit

/// Decodes a BlurHash (blurha.sh): a few dozen characters the server makes for each
/// photo, drawn as a soft blur of its colours while the photo loads.
enum BlurHash {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(_ hash: String, size: Int = 32) -> UIImage? {
        if let cached = cache.object(forKey: hash as NSString) { return cached }
        guard let image = decode(hash, width: size, height: size) else { return nil }
        cache.setObject(image, forKey: hash as NSString)
        return image
    }

    static func decode(_ hash: String, width: Int, height: Int, punch: Float = 1) -> UIImage? {
        let chars = Array(hash)
        guard chars.count >= 6, let sizeFlag = decode83(chars[0..<1]) else { return nil }
        let numY = (sizeFlag / 9) + 1
        let numX = (sizeFlag % 9) + 1
        guard chars.count == 4 + 2 * numX * numY, let quantisedMax = decode83(chars[1..<2]) else { return nil }
        let maxValue = Float(quantisedMax + 1) / 166

        var colours: [(Float, Float, Float)] = []
        for i in 0..<(numX * numY) {
            if i == 0 {
                guard let value = decode83(chars[2..<6]) else { return nil }
                colours.append(decodeDC(value))
            } else {
                let start = 4 + i * 2
                guard let value = decode83(chars[start..<(start + 2)]) else { return nil }
                colours.append(decodeAC(value, maxValue: maxValue * punch))
            }
        }

        var pixels = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                var r: Float = 0, g: Float = 0, b: Float = 0
                for j in 0..<numY {
                    for i in 0..<numX {
                        let basis = cos(Float.pi * Float(x * i) / Float(width)) * cos(Float.pi * Float(y * j) / Float(height))
                        let colour = colours[i + j * numX]
                        r += colour.0 * basis
                        g += colour.1 * basis
                        b += colour.2 * basis
                    }
                }
                let offset = (y * width + x) * 4
                pixels[offset] = linearToSRGB(r)
                pixels[offset + 1] = linearToSRGB(g)
                pixels[offset + 2] = linearToSRGB(b)
            }
        }

        let data = Data(pixels) as CFData
        guard let provider = CGDataProvider(data: data),
              let cgImage = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                                    space: CGColorSpaceCreateDeviceRGB(),
                                    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                                    provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private static let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~")
    private static let lookup: [Character: Int] = Dictionary(uniqueKeysWithValues: alphabet.enumerated().map { ($1, $0) })

    static func decode83(_ chars: ArraySlice<Character>) -> Int? {
        var value = 0
        for char in chars {
            guard let digit = lookup[char] else { return nil }
            value = value * 83 + digit
        }
        return value
    }

    private static func decodeDC(_ value: Int) -> (Float, Float, Float) {
        (sRGBToLinear(value >> 16), sRGBToLinear((value >> 8) & 255), sRGBToLinear(value & 255))
    }

    private static func decodeAC(_ value: Int, maxValue: Float) -> (Float, Float, Float) {
        func component(_ quantised: Int) -> Float {
            let v = (Float(quantised) - 9) / 9
            return copysign(v * v, v) * maxValue
        }
        return (component(value / (19 * 19)), component((value / 19) % 19), component(value % 19))
    }

    private static func sRGBToLinear(_ value: Int) -> Float {
        let v = Float(value) / 255
        return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }

    private static func linearToSRGB(_ value: Float) -> UInt8 {
        let v = max(0, min(1, value))
        let srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1 / 2.4) - 0.055
        return UInt8(max(0, min(255, (srgb * 255 + 0.5).rounded(.down))))
    }
}
