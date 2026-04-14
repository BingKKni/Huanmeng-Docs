<script setup>
import { computed, ref, watch } from 'vue'
import { withBase } from 'vitepress'

defineOptions({
  name: 'SidebarNavItem'
})

const props = defineProps({
  items: {
    type: Array,
    default: null
  },
  item: {
    type: Object,
    default: null
  },
  depth: {
    type: Number,
    default: 0
  },
  pageRelativePath: {
    type: String,
    required: true
  },
  expandedKeys: {
    type: Object,
    default: null
  }
})

const localExpandedKeys = ref({})
const sharedExpandedKeys = computed(() => props.expandedKeys ?? localExpandedKeys.value)
const hasRootItems = computed(() => Array.isArray(props.items) && props.items.length > 0)

function hasChildren(item) {
  return Array.isArray(item?.children) && item.children.length > 0
}

function isItemActive(item, relativePath = props.pageRelativePath) {
  if (typeof item?.isActive === 'function' && item.isActive(relativePath)) {
    return true
  }

  if (typeof item?.hasAnyActive === 'function' && item.hasAnyActive(relativePath)) {
    return true
  }

  return hasChildren(item)
    ? item.children.some(child => isItemActive(child, relativePath))
    : false
}

function expandActiveBranch(items, relativePath) {
  items.forEach(item => {
    if (!hasChildren(item)) return
    if (isItemActive(item, relativePath)) {
      sharedExpandedKeys.value[item.href] = true
    }
    expandActiveBranch(item.children, relativePath)
  })
}

watch(
  () => props.pageRelativePath,
  newPath => {
    if (!hasRootItems.value) return
    expandActiveBranch(props.items, newPath)
  },
  { immediate: true }
)

const isExactActive = computed(() =>
  typeof props.item?.isActive === 'function'
    ? props.item.isActive(props.pageRelativePath)
    : false
)

const isExpanded = computed(() => !!sharedExpandedKeys.value[props.item?.href])
const isToggleOnly = computed(() => hasChildren(props.item) && props.item.navigable === false)
const itemTag = computed(() => (isToggleOnly.value ? 'button' : 'a'))
const itemHref = computed(() => {
  if (props.item?.isExternal) return props.item.href
  return props.item ? withBase(props.item.href) : undefined
})

function handleItemClick(event) {
  if (!hasChildren(props.item)) return
  if (!isToggleOnly.value && !isExactActive.value) return
  event.preventDefault()
  toggleItem(props.item)
}

function toggleItem(item) {
  if (!hasChildren(item)) return
  sharedExpandedKeys.value[item.href] = !sharedExpandedKeys.value[item.href]
}
</script>

<template>
  <template v-if="hasRootItems">
    <SidebarNavItem
      v-for="entry in items"
      :key="`desktop-sidebar-${entry.href}`"
      :item="entry"
      :depth="0"
      :page-relative-path="pageRelativePath"
      :expanded-keys="sharedExpandedKeys"
    />
  </template>

  <div v-else-if="item" class="desktop-doc-sidebar__group">
    <component
      :is="itemTag"
      class="desktop-doc-sidebar__item-link"
      :class="[
        depth === 0 ? 'desktop-doc-sidebar__link' : 'desktop-doc-sidebar__child-link',
        {
          active: isExactActive,
          'has-children': hasChildren(item),
          'is-toggle-only': isToggleOnly
        }
      ]"
      :style="{ '--sidebar-depth': depth }"
      :href="itemTag === 'a' ? itemHref : undefined"
      :type="itemTag === 'button' ? 'button' : undefined"
      :target="item.isExternal ? '_blank' : undefined"
      :rel="item.isExternal ? 'noopener noreferrer' : undefined"
      :aria-current="isExactActive ? 'page' : undefined"
      :aria-expanded="hasChildren(item) ? String(isExpanded) : undefined"
      @click="handleItemClick"
    >
      <span class="desktop-doc-sidebar__item-label">{{ item.label }}</span>
      <span
        v-if="hasChildren(item)"
        class="sidebar-menu-trigger"
        :aria-label="`${isExpanded ? '收起' : '展开'} ${item.label}`"
      >
        <svg
          class="sidebar-menu-icon"
          :class="{ expanded: isExpanded }"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </span>
    </component>

    <div
      v-if="hasChildren(item)"
      class="desktop-doc-sidebar__children"
      :class="{ expanded: isExpanded }"
    >
      <div class="desktop-doc-sidebar__children-inner">
        <SidebarNavItem
          v-for="child in item.children"
          :key="`desktop-sidebar-child-${child.href}`"
          :item="child"
          :depth="depth + 1"
          :page-relative-path="pageRelativePath"
          :expanded-keys="sharedExpandedKeys"
        />
      </div>
    </div>
  </div>
</template>
