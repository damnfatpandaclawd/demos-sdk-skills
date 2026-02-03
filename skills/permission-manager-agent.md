# Permission Manager Agent Skill

Build agents that manage role-based access control and permissions.

## Overview

Permission Manager enables agents to define roles, assign permissions, and enforce access control across operations. Essential for multi-user systems, DAOs, and enterprise applications.

## SDK Reference

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Permission Methods
StorageProgram.checkPermission(acl, owner, requester, permission)
StorageProgram.updateAccessControl(address, newAcl)
StorageProgram.groupACL(groups)
```

## Agent Use Cases

### 1. Role-Based Access Agent

Manage hierarchical roles:

```typescript
class RoleBasedAccessAgent {
  private demos: Demos
  private rolesAddress: string

  async createRole(
    roleName: string,
    permissions: Permission[]
  ): Promise<void> {
    const roles = await this.getRoles()
    roles[roleName] = {
      name: roleName,
      permissions,
      members: [],
      createdAt: Date.now()
    }
    await this.saveRoles(roles)
  }

  async assignRole(
    address: string,
    roleName: string
  ): Promise<void> {
    const roles = await this.getRoles()
    if (!roles[roleName]) throw new Error("Role not found")

    roles[roleName].members.push(address)
    await this.saveRoles(roles)
  }

  async checkPermission(
    address: string,
    permission: Permission
  ): Promise<boolean> {
    const roles = await this.getRoles()

    for (const role of Object.values(roles)) {
      if (role.members.includes(address)) {
        if (role.permissions.includes(permission) ||
            role.permissions.includes("*")) {
          return true
        }
      }
    }

    return false
  }

  async enforcePermission(
    address: string,
    permission: Permission
  ): Promise<void> {
    const hasPermission = await this.checkPermission(address, permission)
    if (!hasPermission) {
      throw new Error(`Address ${address} lacks permission: ${permission}`)
    }
  }
}
```

### 2. Multi-Sig Permission Agent

Require multiple approvals:

```typescript
class MultiSigPermissionAgent {
  private demos: Demos
  private threshold: number

  async createProposal(
    action: PermissionedAction,
    proposer: string
  ): Promise<Proposal> {
    const proposal: Proposal = {
      id: this.generateProposalId(),
      action,
      proposer,
      approvals: [proposer],
      createdAt: Date.now(),
      status: "pending"
    }

    await this.storeProposal(proposal)
    return proposal
  }

  async approve(
    proposalId: string,
    approver: string
  ): Promise<ApprovalResult> {
    const proposal = await this.getProposal(proposalId)

    if (proposal.approvals.includes(approver)) {
      return { success: false, error: "Already approved" }
    }

    proposal.approvals.push(approver)

    if (proposal.approvals.length >= this.threshold) {
      proposal.status = "approved"
      await this.executeAction(proposal.action)
    }

    await this.storeProposal(proposal)

    return {
      success: true,
      approvalCount: proposal.approvals.length,
      threshold: this.threshold,
      executed: proposal.status === "approved"
    }
  }
}
```

## Best Practices

1. **Use principle of least privilege**
2. **Log all permission changes**
3. **Implement permission inheritance**
4. **Review permissions periodically**
5. **Use multi-sig for critical operations**

## Related Skills

- [Storage Program](./storage-program-agent.md) - ACL management
- [Audit Trail](./audit-trail-agent.md) - Permission change logging
