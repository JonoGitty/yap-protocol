import type { BranchState, BranchStateValue, YapPacket } from "./types.js";

export class BranchManager {
  private branches = new Map<string, BranchState>();

  createBranch(threadId: string): BranchState {
    const branch: BranchState = {
      thread_id: threadId,
      state: "INITIATED",
      packets: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.branches.set(threadId, branch);
    return branch;
  }

  getBranch(threadId: string): BranchState | undefined {
    return this.branches.get(threadId);
  }

  addPacket(threadId: string, packet: YapPacket): void {
    let branch = this.branches.get(threadId);
    if (!branch) {
      branch = this.createBranch(threadId);
    }
    branch.packets.push(packet);
    branch.updated_at = new Date().toISOString();

    // Auto-transition state based on packet type
    if (branch.state === "INITIATED" && branch.packets.length > 1) {
      branch.state = "NEGOTIATING";
    }
    if (packet.type === "resolution") {
      branch.state = "PROPOSED";
    }
    if (packet.type === "resolution_response") {
      if (packet.status === "confirmed") {
        branch.state = "CONFIRMED";
      } else if (packet.status === "declined") {
        branch.state = "DECLINED";
      }
    }
  }

  updateState(threadId: string, state: BranchStateValue): void {
    const branch = this.branches.get(threadId);
    if (branch) {
      branch.state = state;
      branch.updated_at = new Date().toISOString();
    }
  }

  listBranches(): BranchState[] {
    return Array.from(this.branches.values());
  }
}
