/**
 * Shared relay node helpers for mobile-native interactive rendering.
 */
export function buildNativeFlowRelayNodes() {
  return [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: {
            type: "native_flow",
            v: "1",
          },
          content: [
            {
              tag: "native_flow",
              attrs: {
                name: "mixed",
                v: "1",
              },
            },
          ],
        },
      ],
    },
  ];
}
