package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Seller listing create payload — mirrors backend `MyListingCreate`
 * (POST /api/v1/listings/mine). Only make/model are required.
 */
@Serializable
data class MyListingCreateDto(
    val make: String,
    val model: String,
    val year: Int? = null,
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val mileage: Int? = null,
    @SerialName("fuel_type") val fuelType: String? = null,
    val transmission: String? = null,
    val condition: String? = null,
    @SerialName("body_type") val bodyType: String? = null,
    @SerialName("vehicle_category") val vehicleCategory: String? = null,
    val district: String? = null,
    val city: String? = null,
    val title: String? = null,
    val description: String? = null,
    @SerialName("contact_name") val contactName: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("image_urls") val imageUrls: List<String> = emptyList(),
)

/** Subset of backend `MyListingRead` returned on create (201). */
@Serializable
data class MyListingDto(
    val id: Int = 0,
    val make: String = "",
    val model: String = "",
    val year: Int? = null,
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val status: String = "",
)
