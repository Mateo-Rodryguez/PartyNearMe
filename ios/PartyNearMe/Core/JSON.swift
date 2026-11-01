import Foundation

/// The API and Supabase both speak snake_case JSON; Swift code uses camelCase.
enum JSON {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    /// Optional fields that are nil are left out, so a PATCH only changes what was passed.
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()
}

enum HTTP {
    /// Generous timeouts: the free server sleeps when idle and takes up to a minute to wake.
    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 75
        config.timeoutIntervalForResource = 120
        return URLSession(configuration: config)
    }()

    /// Sends a request and hands back the body and status code.
    static func send(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await session.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

extension String {
    /// Safe to put in a URL path: ids from the server are UUIDs, but nothing is assumed.
    var pathEscaped: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? self
    }
}
