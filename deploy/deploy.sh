#!/bin/bash
# Deploy Yap tree to Fly.io
# Run from the project root: bash deploy/deploy.sh

set -e

echo "=== Yap Tree Deployment ==="
echo ""

# Check fly CLI
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it:"
    echo "   curl -L https://fly.io/install.sh | sh"
    echo "   Then: fly auth login"
    exit 1
fi

# Check logged in
if ! fly auth whoami &> /dev/null; then
    echo "❌ Not logged in. Run: fly auth login"
    exit 1
fi

echo "✅ Fly CLI ready ($(fly auth whoami))"
echo ""

# Create app if not exists
if ! fly apps list | grep -q "yap-tree"; then
    echo "Creating app..."
    fly apps create yap-tree
else
    echo "✅ App yap-tree exists"
fi

# Create volume if not exists
if ! fly volumes list -a yap-tree 2>/dev/null | grep -q "yap_data"; then
    echo "Creating persistent volume..."
    fly volumes create yap_data --size 1 --region lhr -a yap-tree -y
else
    echo "✅ Volume yap_data exists"
fi

# Set invite code if not already set
echo ""
echo "Setting secrets (if not already set)..."
echo "You'll be prompted for an invite code — this is required to register handles."
echo "Choose something secret. Users need it to register."
echo ""
read -p "Invite code (leave empty to skip): " INVITE_CODE
if [ -n "$INVITE_CODE" ]; then
    fly secrets set YAP_INVITE_CODE="$INVITE_CODE" -a yap-tree
    echo "✅ Invite code set"
fi

# Deploy
echo ""
echo "Deploying..."
fly deploy --config deploy/fly.toml --dockerfile deploy/Dockerfile -a yap-tree

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Your tree is at: https://yap-tree.fly.dev"
echo ""
echo "Next steps:"
echo "  1. Add custom domain:"
echo "     fly certs add tree.yapprotocol.dev -a yap-tree"
echo "     Then add DNS CNAME: tree.yapprotocol.dev → yap-tree.fly.dev"
echo ""
echo "  2. Register your handle:"
echo "     curl -X POST https://yap-tree.fly.dev:8790/register \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"handle\": \"jono\", \"invite_code\": \"YOUR_CODE\"}'"
echo ""
echo "  3. Update your .mcp.json to point to the public tree:"
echo "     YAP_TREE_URL=wss://tree.yapprotocol.dev"
echo ""
