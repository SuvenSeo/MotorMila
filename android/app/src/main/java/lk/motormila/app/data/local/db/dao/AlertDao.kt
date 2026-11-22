package lk.motormila.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow
import lk.motormila.app.data.local.db.entity.AlertEntity

@Dao
interface AlertDao {
    @Query("SELECT * FROM alerts WHERE owner = :owner ORDER BY id DESC")
    fun observe(owner: String): Flow<List<AlertEntity>>

    @Query("SELECT * FROM alerts WHERE owner = :owner ORDER BY id DESC")
    suspend fun getAll(owner: String): List<AlertEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<AlertEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: AlertEntity)

    @Query("DELETE FROM alerts WHERE owner = :owner AND id = :id")
    suspend fun delete(owner: String, id: Int)

    @Query("DELETE FROM alerts WHERE owner = :owner")
    suspend fun clear(owner: String)

    @Transaction
    suspend fun replace(owner: String, rows: List<AlertEntity>) {
        require(rows.all { it.owner == owner })
        clear(owner)
        upsertAll(rows)
    }
}
