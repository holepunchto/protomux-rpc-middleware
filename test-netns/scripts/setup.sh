#!/usr/bin/env bash
# Set up two Linux network namespaces connected via a bridge for tests
set -euo pipefail

NS1=test-net-1
NS2=test-net-2
BR=test-bridge
BR_IP=10.200.1.1/24
NS1_IP=10.200.1.2/24
NS2_IP=10.200.1.3/24

# Create namespaces
ip netns add "$NS1"
ip netns add "$NS2"

# Create bridge in root namespace
ip link add name "$BR" type bridge
ip addr add "$BR_IP" dev "$BR" 2>/dev/null
ip link set "$BR" up

# veth for NS1
ip link add veth1-br type veth peer name veth1-ns
ip link set veth1-ns netns "$NS1"
ip link set veth1-br master "$BR"
ip link set veth1-br up
ip netns exec "$NS1" ip addr add "$NS1_IP" dev veth1-ns
ip netns exec "$NS1" ip link set veth1-ns up
ip netns exec "$NS1" ip link set lo up

# veth for NS2
ip link add veth2-br type veth peer name veth2-ns
ip link set veth2-ns netns "$NS2"
ip link set veth2-br master "$BR"
ip link set veth2-br up
ip netns exec "$NS2" ip addr add "$NS2_IP" dev veth2-ns
ip netns exec "$NS2" ip link set veth2-ns up
ip netns exec "$NS2" ip link set lo up

echo "Root bridge $BR has IP $BR_IP"
echo "NS1 has IP $NS1_IP, NS2 has IP $NS2_IP"