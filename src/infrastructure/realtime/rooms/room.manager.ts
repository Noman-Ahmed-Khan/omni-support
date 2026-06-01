export class RoomManager {
  // room -> Set of clientIds
  private rooms: Map<string, Set<string>> = new Map();
  // clientId -> Set of rooms
  private clientRooms: Map<string, Set<string>> = new Map();

  joinRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);

    if (!this.clientRooms.has(clientId)) {
      this.clientRooms.set(clientId, new Set());
    }
    this.clientRooms.get(clientId)!.add(room);
  }

  leaveRoom(clientId: string, room: string): void {
    this.rooms.get(room)?.delete(clientId);
    this.clientRooms.get(clientId)?.delete(room);

    // Cleanup empty rooms
    if (this.rooms.get(room)?.size === 0) {
      this.rooms.delete(room);
    }
  }

  removeClient(clientId: string): void {
    const rooms = this.clientRooms.get(clientId) ?? new Set();

    rooms.forEach((room) => {
      this.rooms.get(room)?.delete(clientId);
      if (this.rooms.get(room)?.size === 0) {
        this.rooms.delete(room);
      }
    });

    this.clientRooms.delete(clientId);
  }

  getClientsInRoom(room: string): string[] {
    return Array.from(this.rooms.get(room) ?? []);
  }

  getClientRooms(clientId: string): string[] {
    return Array.from(this.clientRooms.get(clientId) ?? []);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getClientCount(): number {
    return this.clientRooms.size;
  }
}