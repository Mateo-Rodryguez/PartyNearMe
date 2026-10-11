package com.partynearme.core

/** A request the server turned down, with a message that is fine to show the user. */
class ApiException(val status: Int, override val message: String) : Exception(message)

/** The session is gone (signed out elsewhere, or the refresh token expired). */
class SignedOutException : Exception("Please sign in again")
