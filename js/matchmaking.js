/**
 * Client-side battle queue: Firestore battle_queue + player_slots + battle_matches.
 * Pairing uses deterministic "executor" (lexicographically smallest queue doc id of the pair)
 * so only one client commits the batch.
 */
(function () {
  "use strict";

  function joinedMs(d) {
    const j = d.data().joinedAt;
    if (j && typeof j.toMillis === "function") return j.toMillis();
    return 0;
  }

  function getDb() {
    if (typeof firebase === "undefined" || !firebase.apps.length) {
      throw new Error(
        "Firebase is not initialized. Check that gstatic.com scripts load (disable ad/shield blocking), then refresh.",
      );
    }
    return firebase.firestore();
  }

  function guestId() {
    let g = sessionStorage.getItem("na_guest");
    if (!g) {
      g = crypto.randomUUID();
      sessionStorage.setItem("na_guest", g);
    }
    return g;
  }

  /**
   * @param {(info: { matchId: string; guestId: string }) => void} onMatch
   * @param {(status: string) => void} onStatus
   * @returns {Promise<() => Promise<void>>}
   */
  async function joinBattleQueue(onMatch, onStatus) {
    const db = getDb();
    const gid = guestId();
    onStatus("Connecting…");

    const slotRef = db.collection("player_slots").doc(gid);
    await slotRef.set({ matchId: firebase.firestore.FieldValue.delete() }, { merge: true });

    const qref = await db.collection("battle_queue").add({
      guestId: gid,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: "waiting",
    });

    let matchedOnce = false;
    function fireMatch(matchId) {
      if (matchedOnce) return;
      matchedOnce = true;
      onMatch({ matchId, guestId: gid });
    }

    const unsubSlot = slotRef.onSnapshot((snap) => {
      const mid = snap.data()?.matchId;
      if (mid) {
        onStatus("Match found");
        fireMatch(mid);
      }
    });

    const unsubQueue = db.collection("battle_queue").onSnapshot((snap) => {
      const waiting = snap.docs
        .filter((d) => d.data().state === "waiting")
        .sort((a, b) => {
          const am = joinedMs(a);
          const bm = joinedMs(b);
          if (am !== bm) return am - bm;
          return a.id.localeCompare(b.id);
        });
      onStatus(`In queue… (${waiting.length} waiting)`);

      if (waiting.length < 2) return;
      const d0 = waiting[0];
      const d1 = waiting[1];
      const exec = [d0.id, d1.id].sort()[0];
      if (qref.id !== exec) return;

      const batch = db.batch();
      const matchRef = db.collection("battle_matches").doc();
      const g0 = d0.data().guestId;
      const g1 = d1.data().guestId;
      batch.set(matchRef, {
        players: [g0, g1],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection("player_slots").doc(g0), { matchId: matchRef.id }, { merge: true });
      batch.set(db.collection("player_slots").doc(g1), { matchId: matchRef.id }, { merge: true });
      batch.delete(d0.ref);
      batch.delete(d1.ref);
      batch.commit().catch(() => {});
    });

    return async function cancel() {
      unsubQueue();
      unsubSlot();
      try {
        await qref.delete();
      } catch (_) {
        /* already removed when matched */
      }
    };
  }

  window.NightArenaMatchmaking = { joinBattleQueue, guestId };
})();
