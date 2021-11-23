/**
 * Tencent is pleased to support the open source community by making 蓝鲸智云PaaS平台社区版 (BlueKing PaaS Community Edition) available.
 * Copyright (C) 2017-2018 THL A29 Limited, a Tencent company. All rights reserved.
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

import {
    defineComponent,
    watch,
    reactive,
    toRef,
    ref
} from '@vue/composition-api'
import { VNode } from 'vue'
import fieldTable from '@/components/field-table/field-table'
import { uuid } from '@/common/util'
import { ORM_KEYS, BASE_COLUMNS } from 'shared/data-source/constant'

export interface IFieldSelectOption {
    id: string
    name: string
}

interface ITableFieldRule {
    validator: Function,
    message: string
}

export interface ITableField {
    name: string
    type: string
    prop: string
    optionsList?: IFieldSelectOption[]
    width?: string
    isRequire?: boolean
    inputType?: string
    isReadonly?: boolean | Function,
    rules?: ITableFieldRule[],
    tips?: string
}

export interface ITableStatus {
    data: object[]
}

function getDefaultRow () {
    return {
        type: '',
        name: '',
        primary: false,
        index: false,
        nullable: false,
        default: '',
        comment: '',
        generated: false,
        createDate: false,
        updateDate: false,
        length: '',
        scale: ''
    }
}

/**
 * orm 数据转为表格数据
 * @param item orm 数据
 * @returns 表格数据
 */
function normalizeTableItem (item) {
    const defaultRow = getDefaultRow()
    const normalizedItem = Object.assign({}, defaultRow, item)
    // 由于mysql限制，部分字段不可修改，需要设置默认值
    switch (normalizedItem.type) {
        case 'int':
            normalizedItem.length = 11
            normalizedItem.scale = 0
            break
        case 'varchar':
            normalizedItem.scale = 0
            break
        case 'text':
            normalizedItem.scale = 0
            normalizedItem.length = 65535
            break
        case 'datetime':
            normalizedItem.scale = 0
            normalizedItem.length = 0
            break
        default:
            break
    }
    // 默认列不可修改
    if (BASE_COLUMNS.some(item => item.columnId === normalizedItem.columnId)) {
        normalizedItem.isReadonly = true
    }
    // 每一行加id，用于 diff
    if (!Reflect.has(normalizedItem, 'columnId')) {
        normalizedItem.columnId = uuid(8)
    }
    return normalizedItem
}

/**
 * 表格数据转为orm 数据
 * @param item 表格数据
 * @returns orm 数据
 */
function normalizeOrmItem (item) {
    return ORM_KEYS.reduce((acc, cur) => {
        if (Reflect.has(item, cur)) {
            acc[cur] = item[cur]
        }
        return acc
    }, {})
}

export default defineComponent({
    components: {
        fieldTable
    },

    props: {
        data: Array
    },

    setup (props: ITableStatus, { emit }) {
        const tableFields: ITableField[] = [
            {
                name: '字段名称',
                type: 'input',
                prop: 'name',
                isRequire: true,
                rules: [
                    {
                        validator (val, row) {
                            return /^[a-zA-Z][a-zA-Z-_]*[a-zA-Z]$/.test(val)
                        },
                        message: '开头和结尾需是大小写字母，中间可以是大小写字母、连字符和下划线。长度最少为2个字符'
                    },
                    {
                        validator (val, row) {
                            return !tableList.find((table) => table.name === val && row.columnId !== table.columnId)
                        },
                        message: '字段名称不能重复'
                    }
                ]
            },
            {
                name: '字段类型',
                type: 'select',
                prop: 'type',
                isRequire: true,
                optionsList: [
                    {
                        id: 'varchar',
                        name: 'varchar'
                    },
                    {
                        id: 'int',
                        name: 'int'
                    },
                    {
                        id: 'datetime',
                        name: 'datetime'
                    },
                    {
                        id: 'text',
                        name: 'text'
                    },
                    {
                        id: 'decimal',
                        name: 'decimal'
                    }
                ]
            },
            {
                name: '长度',
                type: 'input',
                prop: 'length',
                isReadonly (item, props) {
                    return !['varchar', 'decimal'].includes(props?.row?.type)
                },
                rules: [
                    {
                        validator (val = 0, row) {
                            return row.type !== 'varchar' || (val <= 15000 && val > 0)
                        },
                        message: 'varchar 类型的长度需大于 0 小于 15000'
                    },
                    {
                        validator (val = 0, row) {
                            return row.type !== 'decimal' || (val <= 65 && val > 0)
                        },
                        message: 'decimal 类型的长度需大于 0 小于 65'
                    }
                ]
            },
            {
                name: '小数点',
                type: 'input',
                prop: 'scale',
                isReadonly (item, props) {
                    return !['decimal'].includes(props?.row?.type)
                },
                rules: [
                    {
                        validator (val = 0, row) {
                            return row.type !== 'decimal' || (val > 0 && val < row.length)
                        },
                        message: '小数点字段需要大于 0 且小于长度字段'
                    }
                ]
            },
            {
                name: '索引',
                type: 'checkbox',
                prop: 'index',
                width: '100px',
                isReadonly (item, props) {
                    return props?.row?.type === 'text'
                }
            },
            {
                name: '可空',
                type: 'checkbox',
                prop: 'nullable',
                width: '100px'
            },
            {
                name: '默认值',
                type: 'input',
                prop: 'default',
                isReadonly (item, props) {
                    return props?.row?.type === 'text'
                }
            },
            {
                name: '备注',
                type: 'input',
                prop: 'comment'
            }
        ]
        const tableList = reactive([])
        const tableRef = ref(null)

        watch(
            toRef(props, 'data'),
            (val) => {
                tableList.splice(
                    0,
                    tableList.length,
                    ...val.map(normalizeTableItem)
                )
            },
            {
                immediate: true
            }
        )

        const addField = (row, index) => {
            const defaultRow = getDefaultRow()
            tableList.splice(index + 1, 0, defaultRow)
            emit('change')
        }

        const deleteField = (row, index) => {
            tableList.splice(index, 1)
            emit('change')
        }

        const changeData = (value, row, column, index) => {
            // 设置值
            const currentRow = tableList[index]
            Object.assign(currentRow, { [column.prop]: value })

            // 标准化
            const normalizedItem = normalizeTableItem(currentRow)
            Object.assign(currentRow, normalizedItem)

            // 触发 change 事件
            emit('change')
        }

        const validate = () => {
            return new Promise((resolve, reject) => {
                tableRef.value?.verification().then(() => {
                    resolve(tableList.map(normalizeOrmItem))
                }).catch(reject)
            })
        }

        return {
            tableList,
            tableFields,
            tableRef,
            addField,
            deleteField,
            changeData,
            validate
        }
    },

    render (): VNode {
        return (
            <field-table
                ref="tableRef"
                data={this.tableList}
                column={this.tableFields}
                onAdd={this.addField}
                onDelete={this.deleteField}
                onChange={this.changeData}
            ></field-table>
        )
    }
})
